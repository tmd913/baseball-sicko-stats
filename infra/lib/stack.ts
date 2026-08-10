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
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as r53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');

export interface SickoStackProps extends StackProps {
  /**
   * An origin Cognito should accept as a callback, e.g.
   * `https://d111.cloudfront.net`.
   *
   * With no `domainName` this is the site's own origin and the reason for the
   * two-pass first deploy. With one, the apex is the origin and this narrows to
   * its remaining job: keeping a *previous* origin signable-in. The CloudFront
   * domain never stops serving the app, so dropping its callback would let an
   * old bookmark load the page and then fail at sign-in.
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
  /**
   * Registered apex domain, e.g. `statcastsicko.com`. Omit to stay on the
   * CloudFront-assigned domain.
   *
   * Its hosted zone must already exist in this account (registering through
   * Route 53 creates one), because it is resolved by a context lookup at synth
   * time — the ACM certificate validates against it and the alias records are
   * written into it. Supplying it also collapses the two-pass first deploy:
   * the site origin is known before the distribution exists, so `siteUrl` no
   * longer has to be fed back in as context.
   */
  domainName?: string;
  /** Google OAuth client id, and the Secrets Manager secret holding its secret.
   *  Omit both to deploy with email/password sign-in only. */
  googleClientId?: string;
  googleSecretName?: string;
  /** Prefix for the Cognito hosted-UI domain. Must be globally unique.
   *
   *  Sign-in is drawn by the app itself now (`client/src/auth.tsx`), so this
   *  only serves the one page the app can't draw: the redirect that federates
   *  to Google. */
  cognitoPrefix: string;
  /**
   * The address Cognito's confirmation and password-reset emails come *from*,
   * e.g. `no-reply@statcastsicko.com`. Omit to keep Cognito's own shared
   * sender.
   *
   * This is deliberately separate from `domainName`, which is what actually
   * creates the SES identity and its DKIM records. The two are split because
   * a new SES account is in the **sandbox**, where it may only email verified
   * addresses — switching Cognito over before production access is granted
   * would turn every sign-up into a `CodeDeliveryFailureException`. So the
   * identity is created and verified on the first deploy, and this flag flips
   * sending over on a later one, once the AWS console says the account is out
   * of the sandbox.
   */
  sesFromEmail?: string;
}

export class SickoStack extends Stack {
  constructor(scope: Construct, id: string, props: SickoStackProps) {
    super(scope, id, props);

    const { siteUrl, domainName, googleClientId, googleSecretName, cognitoPrefix, sesFromEmail } =
      props;

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

    // Shared by all three functions. Declared up here rather than beside the
    // API function because the Cognito message trigger below is built before
    // the user pool that calls it.
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

    // ---- Email --------------------------------------------------------

    // The zone is imported rather than created: Route 53 makes one when the
    // domain is registered, and a second zone for the same name would serve
    // records the registrar's delegation never points at. It is resolved here,
    // ahead of everything that writes into it, because the SES identity's DKIM
    // records are the first of them.
    const zone = domainName
      ? route53.HostedZone.fromLookup(this, 'Zone', { domainName })
      : undefined;

    /**
     * Sending confirmation codes from a domain we own and sign.
     *
     * Cognito's default sender is `no-reply@verificationemail.com`, shared
     * with every other user pool on the platform and aligned with nothing. A
     * six-digit code from an address like that, about a product it can't name,
     * is close to the definition of what a spam filter is looking for — which
     * is why sign-up emails were landing in junk. Three records fix the half
     * of that which is deliverability rather than wording:
     *
     *  - **DKIM**, written by `Identity.publicHostedZone` — three CNAMEs to
     *    Amazon-managed keys, so every message carries a signature that
     *    validates against `statcastsicko.com`.
     *  - **A custom MAIL FROM subdomain**, which is what makes SPF *align*:
     *    without one the envelope sender is an `amazonses.com` domain, so SPF
     *    passes for Amazon and aligns with nobody. `mailFromDomain` writes its
     *    MX and SPF records into the zone itself, so they aren't here.
     *  - **DMARC**, at `p=none`, which is the one record nothing writes for us.
     *    Gmail and Yahoo now require bulk senders to
     *    publish one at all, and monitoring-only is the right first setting:
     *    it asks nothing to be rejected while the domain has no sending
     *    history.
     *
     * The identity is created whenever there's a zone, and costs nothing
     * standing idle. Whether Cognito *uses* it is `sesFromEmail`'s decision —
     * see the prop, and the sandbox it exists to survive.
     */
    let userPoolEmail: cognito.UserPoolEmail | undefined;
    let sesIdentity: ses.EmailIdentity | undefined;
    if (domainName && zone) {
      sesIdentity = new ses.EmailIdentity(this, 'SesIdentity', {
        identity: ses.Identity.publicHostedZone(zone),
        mailFromDomain: `mail.${domainName}`,
        // If the MX below is ever missing or misconfigured, fall back to
        // Amazon's own envelope domain rather than refusing to send: a
        // deliverability optimisation must not be able to stop a sign-up.
        mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
      });

      new route53.TxtRecord(this, 'DmarcRecord', {
        zone,
        recordName: `_dmarc.${domainName}`,
        values: ['v=DMARC1; p=none;'],
        ttl: Duration.hours(1),
      });

      if (sesFromEmail) {
        userPoolEmail = cognito.UserPoolEmail.withSES({
          fromEmail: sesFromEmail,
          // What a mail client shows instead of the address. The whole point
          // of the exercise is that the reader recognises the sender.
          fromName: 'Statcast Sicko',
          sesVerifiedDomain: domainName,
          sesRegion: this.region,
        });
      }
    }

    /**
     * The wording of those emails, which is the other half of the problem.
     *
     * A pool has one verification template and uses it for sign-up *and* for
     * password resets, so anything written there has to be vague enough to
     * cover both — "Your confirmation code is 123456". A CustomMessage trigger
     * is the only place Cognito exposes which of the two it is
     * (`triggerSource`), so the copy lives in a function rather than in this
     * file. See `infra/lambda/cognito-message.ts`, including what happens when
     * it throws.
     */
    const messageFn = new NodejsFunction(this, 'CognitoMessageFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'cognito-message.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(5),
      environment: {
        SITE_URL: siteUrl ?? (domainName ? `https://${domainName}` : 'https://statcastsicko.com'),
      },
      bundling,
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
      // Who the codes come from (see the Email section above) and what they
      // say. `userVerification` is the fallback the trigger displaces: it is
      // only ever seen if `messageFn` is removed or a trigger source it
      // doesn't handle comes up, so it is worded to fit sign-up and password
      // reset alike — which is exactly the vagueness the trigger exists to
      // avoid, and why it isn't the primary.
      ...(userPoolEmail ? { email: userPoolEmail } : {}),
      lambdaTriggers: { customMessage: messageFn },
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: 'Your Statcast Sicko verification code',
        emailBody:
          'Your Statcast Sicko verification code is {####}. ' +
          "If you didn't ask for it, you can ignore this email.",
      },
      // Losing the pool means losing every account, and Cognito subs are the
      // watchlist's partition key — the two have to survive together.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Cognito must not be pointed at an SES identity that hasn't finished
    // verifying, or the pool update fails on an unverified source.
    if (sesIdentity && userPoolEmail) userPool.node.addDependency(sesIdentity);

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
    //
    // The pre-domain CloudFront origin has to be carried in explicitly, via
    // `siteUrl` in cdk.json — it cannot be read off the Distribution construct
    // here without recreating the dependency cycle described above, and once
    // `domainName` supplies the origin it would otherwise fall off the list
    // and strand every bookmark of it at sign-in.
    //
    // The www entry is unreachable while the redirect is in place (the app only
    // ever runs on the apex, and the client builds its redirect_uri from
    // window.location.origin) but is kept so removing the redirect doesn't
    // silently break sign-in.
    const callbackUrls = [
      ...new Set([
        'http://localhost:5173/',
        ...(siteUrl ? [`${siteUrl}/`] : []),
        ...(domainName ? [`https://${domainName}/`, `https://www.${domainName}/`] : []),
      ]),
    ];

    const userPoolClient = userPool.addClient('WebClient', {
      // A browser app can't keep a secret; PKCE covers the exchange instead.
      generateSecret: false,
      // `userPassword` is what lets the app's own sign-in form authenticate
      // without the hosted UI: it posts the password to Cognito inside the TLS
      // body, where SRP would prove knowledge of it without sending it. The
      // hosted UI posted the same password over the same TLS to the same
      // service, so nothing is newly exposed — but see `cognito.ts::signIn`
      // for the trade and the way back to SRP if it stops being worth it.
      // `userSrp` stays on so that route needs no infrastructure change.
      authFlows: { userSrp: true, userPassword: true },
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
      // Cognito's refresh-token clock runs from issuance and a refresh doesn't
      // reset it, so this is exactly how often a signed-in user is sent back
      // through the hosted UI no matter how much they use the app. A year for a
      // personal watchlist; shorten it if the trade (a leaked refresh token
      // stays usable until it's revoked by signing out) stops being worth it.
      refreshTokenValidity: Duration.days(365),
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

    // CloudFront only accepts certificates from us-east-1, which is where this
    // stack already lives. Validation writes its CNAME into the zone above, so
    // the deploy blocks for a minute or two the first time and is instant after.
    const certificate =
      domainName && zone
        ? new acm.Certificate(this, 'SiteCert', {
            domainName,
            subjectAlternativeNames: [`www.${domainName}`],
            validation: acm.CertificateValidation.fromDns(zone),
          })
        : undefined;

    // Only on the default behavior, never on `/api/*`: a 301 on a non-idempotent
    // request is a footgun (browsers may replay it as GET), and the viewer never
    // gets that far anyway — the document request redirects first, so nothing
    // the client issues afterwards is aimed at `www`.
    const wwwRedirect = domainName
      ? new cloudfront.Function(this, 'WwwRedirect', {
          code: cloudfront.FunctionCode.fromFile({
            filePath: path.join(__dirname, 'redirect-to-apex.js'),
          }),
          runtime: cloudfront.FunctionRuntime.JS_2_0,
          comment: 'Redirect www to the apex domain',
        })
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      ...(domainName && certificate
        ? { domainNames: [domainName, `www.${domainName}`], certificate }
        : {}),
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        ...(wwwRedirect
          ? {
              functionAssociations: [
                {
                  function: wwwRedirect,
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                },
              ],
            }
          : {}),
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

    // The apex serves the app; www only exists to 301 onto it. It still needs
    // its own alias records, cert SAN and distribution alias regardless —
    // without all three the redirect itself can't be reached over HTTPS, and
    // the visitor gets a certificate warning instead of a working site.
    if (zone && domainName) {
      const target = route53.RecordTarget.fromAlias(
        new r53targets.CloudFrontTarget(distribution),
      );
      for (const [id, recordName] of [
        ['Apex', undefined],
        ['Www', `www.${domainName}`],
      ] as const) {
        new route53.ARecord(this, `Alias${id}`, { zone, recordName, target });
        // CloudFront answers on IPv6 by default; without this record an
        // IPv6-only client can't resolve the site at all.
        new route53.AaaaRecord(this, `Alias${id}V6`, { zone, recordName, target });
      }
    }

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

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName ?? distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: cognitoDomain });
    new CfnOutput(this, 'CacheBucketName', { value: cacheBucket.bucketName });
    new CfnOutput(this, 'WatchlistTableName', { value: watchlistTable.tableName });
    new CfnOutput(this, 'SesStatus', {
      value: sesFromEmail
        ? `Cognito sends as ${sesFromEmail} via SES`
        : "SES identity created; Cognito still sends from Cognito's shared address. " +
          'Once SES has production access, re-deploy with ' +
          `-c sesFromEmail=no-reply@${domainName ?? 'example.com'}`,
      description: 'Where confirmation and password-reset emails come from',
    });
    new CfnOutput(this, 'GoogleRedirectUri', {
      value: `https://${cognitoDomain}/oauth2/idpresponse`,
      description: 'Add this as an authorized redirect URI on the Google OAuth client',
    });
    // With a custom domain the site origin is known before anything is
    // created, so the callback URL is already right on the first pass.
    if (!siteUrl && !domainName) {
      new CfnOutput(this, 'NextStep', {
        value: `Re-deploy with: npm run cdk -w infra -- deploy -c siteUrl=https://${distribution.distributionDomainName}`,
        description: 'Registers the real site URL as a Cognito callback',
      });
    }
  }
}
