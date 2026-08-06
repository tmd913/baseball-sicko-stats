import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwAuth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwInteg from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');

export interface SickoStackProps extends StackProps {
  /**
   * The site's own origin, e.g. `https://d111.cloudfront.net`.
   *
   * Taken from context rather than read off the Distribution construct, and
   * that is deliberate. Cognito's callback URL needs the site domain; the
   * distribution needs the API as an origin; the API needs the JWT authorizer;
   * the authorizer needs the user pool client — a cycle, unavoidable while the
   * API is a CloudFront behavior *and* the domain is CloudFront-assigned.
   * Passing the URL in as a plain string breaks it, at the cost of one extra
   * deploy the first time (see the README). With a custom domain it's known up
   * front and the second pass disappears.
   */
  siteUrl?: string;
  /** Google OAuth client id, and the Secrets Manager secret holding its secret.
   *  Omit both to deploy with email/password sign-in only. */
  googleClientId?: string;
  googleSecretName?: string;
  /** Prefix for the Cognito hosted-UI domain. Must be globally unique. */
  cognitoPrefix: string;
}

export class SickoStack extends Stack {
  constructor(scope: Construct, id: string, props: SickoStackProps) {
    super(scope, id, props);

    const { siteUrl, googleClientId, googleSecretName, cognitoPrefix } = props;

    // ---- Storage ------------------------------------------------------

    // Everything here is a derived copy of a public upstream response, so it is
    // safe to lose — but expensive to rebuild, which is the whole point of the
    // warmer. RETAIN anyway: an accidental `cdk destroy` shouldn't cost a day
    // of re-fetching from MLB.
    const cacheBucket = new s3.Bucket(this, 'CacheBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // The local cache grew to 808 MB with no eviction at all. Nothing
          // reads a game feed a year later, and per-day snapshots supersede the
          // per-game entries they were built from.
          id: 'expire-old-cache',
          prefix: 'cache/',
          expiration: Duration.days(400),
        },
        { id: 'abort-incomplete-uploads', abortIncompleteMultipartUploadAfter: Duration.days(7) },
      ],
    });

    // One item per user: { userId, players[], version }. A 27-player list is
    // ~3 KB, so a single item is both simplest and order-preserving.
    const watchlistTable = new dynamodb.Table(this, 'WatchlistTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // Safe to recreate — it's just the built client.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---- Auth ---------------------------------------------------------

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Losing the pool means losing every account, and Cognito subs are the
      // watchlist's partition key — the two have to survive together.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: cognitoPrefix },
    });

    const providers: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    let googleIdp: cognito.UserPoolIdentityProviderGoogle | undefined;

    if (googleClientId && googleSecretName) {
      googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool,
        clientId: googleClientId,
        clientSecretValue: SecretValue.secretsManager(googleSecretName),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        },
      });
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    // Callback URLs Cognito will accept. localhost is always allowed so the
    // hosted UI can be exercised against `npm run dev`.
    const callbackUrls = ['http://localhost:5173/', ...(siteUrl ? [`${siteUrl}/`] : [])];

    const userPoolClient = userPool.addClient('WebClient', {
      // A browser app can't keep a secret; PKCE covers the exchange instead.
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls: callbackUrls,
      },
      supportedIdentityProviders: providers,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // The client lists Google in supportedIdentityProviders, so the provider has
    // to exist first — but the dependency belongs on the *client*, not the pool.
    // Putting it on the pool makes UserPool depend on an IdP that already
    // references the pool, which CloudFormation rejects as a circular
    // dependency (and reports as a 19-resource cycle that hides the cause).
    if (googleIdp) userPoolClient.node.addDependency(googleIdp);

    const cognitoDomain = `${cognitoPrefix}.auth.${this.region}.amazoncognito.com`;

    // ---- Compute ------------------------------------------------------

    const lambdaEnv = {
      CACHE_BUCKET: cacheBucket.bucketName,
      WATCHLIST_TABLE: watchlistTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      COGNITO_DOMAIN: cognitoDomain,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const bundling = {
      format: OutputFormat.ESM,
      target: 'node22',
      sourceMap: true,
      // Ship the SDK rather than trusting the runtime's copy. The default
      // (external) is wrong here: `@aws-sdk/lib-dynamodb` — the DocumentClient
      // the watchlist is written through — is not part of the SDK bundled into
      // the Lambda runtime, so leaving it external is a MODULE_NOT_FOUND on the
      // first watchlist read. Bundling also pins the version we tested against.
      bundleAwsSDK: true,
      // The server is ESM and uses import.meta.url, but some transitive deps
      // still expect CommonJS's `require`. esbuild's ESM output has no `require`
      // in scope, so re-create one.
      banner:
        "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
    } as const;

    const apiFn = new NodejsFunction(this, 'ApiFunction', {
      entry: path.join(REPO, 'server', 'src', 'lambda.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      // CPU scales with memory, and the hot path is csv-parse over multi-MB
      // exports — this is a latency setting more than a memory one.
      memorySize: 2048,
      // API Gateway gives up at 30s; there is no point outliving it.
      timeout: Duration.seconds(29),
      environment: lambdaEnv,
      bundling,
    });

    const warmerFn = new NodejsFunction(this, 'WarmerFunction', {
      entry: path.join(REPO, 'server', 'src', 'warmer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      // Parses a full slate of games per day with no request waiting on it.
      memorySize: 3008,
      timeout: Duration.minutes(10),
      environment: lambdaEnv,
      bundling,
    });

    for (const fn of [apiFn, warmerFn]) {
      cacheBucket.grantReadWrite(fn);
      watchlistTable.grantReadWriteData(fn);
    }

    // ---- API ----------------------------------------------------------

    // Rejects unauthenticated traffic at the edge, so it never reaches (or is
    // billed to) the function. The Express middleware still verifies the token
    // itself — that's what decides *which* user, and it has to work locally too.
    const authorizer = new apigwAuth.HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer,
      createDefaultStage: true,
    });

    const integration = new apigwInteg.HttpLambdaIntegration('ApiIntegration', apiFn);

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration,
    });

    // The client has to read its Cognito config before it can possibly hold a
    // token, so these two can't sit behind the authorizer.
    for (const p of ['/api/health', '/api/config']) {
      httpApi.addRoutes({
        path: p,
        methods: [apigw.HttpMethod.GET],
        integration,
        authorizer: new apigw.HttpNoneAuthorizer(),
      });
    }

    const apiDomain = `${httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`;

    // ---- Delivery -----------------------------------------------------

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        // Serving the API from the same origin is what lets the client keep
        // relative URLs and avoid CORS entirely.
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // Responses are per-user and often live; caching them would be wrong
          // rather than merely unhelpful.
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Without this CloudFront strips Authorization and every request 401s.
          // (Host is excluded because API Gateway must see its own hostname.)
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
      },
      // The SPA fallback Express used to do: any unknown path is the app.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: siteBucket,
      sources: [
        s3deploy.Source.asset(path.join(REPO, 'client', 'dist')),
        // Resolved at deploy time, so one client build works anywhere and the
        // bundle never has to be rebuilt per environment.
        s3deploy.Source.jsonData('config.json', {
          userPoolId: userPool.userPoolId,
          clientId: userPoolClient.userPoolClientId,
          cognitoDomain,
          region: this.region,
        }),
      ],
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    // ---- Warming ------------------------------------------------------

    // Today and yesterday: the dates the app opens on, and the only ones that
    // change minute to minute.
    new events.Rule(this, 'WarmLive', {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [
        new targets.LambdaFunction(warmerFn, {
          event: events.RuleTargetInput.fromObject({ mode: 'live' }),
        }),
      ],
    });

    // Overnight: snapshot the days that finalised and refresh per-player season
    // data, which otherwise has no warm path at all.
    new events.Rule(this, 'WarmBackfill', {
      schedule: events.Schedule.cron({ minute: '0', hour: '12' }), // 08:00 ET
      targets: [
        new targets.LambdaFunction(warmerFn, {
          event: events.RuleTargetInput.fromObject({ mode: 'backfill', days: 7 }),
        }),
      ],
    });

    // ---- Outputs ------------------------------------------------------

    new CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: cognitoDomain });
    new CfnOutput(this, 'CacheBucketName', { value: cacheBucket.bucketName });
    new CfnOutput(this, 'WatchlistTableName', { value: watchlistTable.tableName });
    new CfnOutput(this, 'GoogleRedirectUri', {
      value: `https://${cognitoDomain}/oauth2/idpresponse`,
      description: 'Add this as an authorized redirect URI on the Google OAuth client',
    });
    if (!siteUrl) {
      new CfnOutput(this, 'NextStep', {
        value: `Re-deploy with: npm run cdk -w infra -- deploy -c siteUrl=https://${distribution.distributionDomainName}`,
        description: 'Registers the real site URL as a Cognito callback',
      });
    }
  }
}
