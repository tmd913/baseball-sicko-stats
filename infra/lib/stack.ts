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
  /**
   * A subdomain to serve Cognito's own pages from, e.g.
   * `auth.statcastsicko.com`. Omit to stay on the `amazoncognito.com` prefix
   * domain.
   *
   * This exists for a bug rather than for the nicer address. Google sign-in
   * fails intermittently **on iOS only** — reproduced in CloudTrail on
   * 2026-08-14, where `OAuth2Response_GET` returned "Something went wrong"
   * and left the user on a 401 `Login_GET`, and where the retry a few seconds
   * later succeeded. All three recorded occurrences are iOS; no desktop
   * attempt has ever failed. That is the shape a WebKit cross-site cookie
   * mitigation produces on a hop through `*.amazoncognito.com` — a domain the
   * `identity_provider=Google` short-circuit gives the user no interaction
   * with, and which is third-party to the site throughout. Serving the same
   * pages from a subdomain of the site makes the hop same-site.
   *
   * **The cause is inferred, not proven.** Cognito publishes no detail for
   * that leg (the pool is on the ESSENTIALS tier, so `userAuthEvents` log
   * delivery isn't available), and the failing leg could not be reproduced on
   * demand. This is a cheap, reversible thing to try, not a diagnosis — which
   * is exactly why it is two flags and why the prefix domain stays.
   *
   * Setting this **creates** the certificate, the domain and its DNS records
   * and changes nothing about how anyone signs in. `authDomainLive` is what
   * moves traffic onto it. The split is `sesFromEmail`'s, for the same class
   * of reason: Cognito builds a CloudFront distribution for a custom domain
   * and it takes time to propagate, and the Google OAuth client has to list
   * the new `/oauth2/idpresponse` as an authorized redirect URI *before* any
   * request is aimed at it — a manual step in someone else's console, which
   * Google documents as taking anywhere from five minutes to a few hours, and
   * which nothing here can verify. Flipping both at once would put an
   * unverifiable third-party change on the critical path of a deploy.
   *
   * Requires `domainName`, since the certificate validates against its zone
   * and the alias records are written into it.
   */
  authDomainName?: string;
  /**
   * Whether the app actually signs in through `authDomainName`.
   *
   * False (the default) means the domain is built and idle: `/config.json`
   * still names the prefix domain, so every sign-in goes the way it goes
   * today. True points the client, the server and the outputs at the custom
   * domain.
   *
   * **Reversing it is one deploy and needs nothing else.** A user pool can
   * hold a prefix domain and a custom domain at the same time (AWS: "You can
   * have a custom domain and a prefix domain"), and this stack never stops
   * declaring the prefix one — so the old address keeps serving throughout,
   * and dropping this flag moves traffic straight back onto it without
   * waiting for a domain to be torn down or a DNS record to expire.
   *
   * The one documented difference between the two is that Cognito serves
   * `/.well-known/openid-configuration` for the custom domain only. Nothing
   * here reads it: `client/src/cognito.ts` builds the authorize URL itself and
   * posts to the Identity Provider endpoint directly, which is what dropping
   * `oidc-client-ts` bought.
   */
  authDomainLive?: boolean;
}

export class SickoStack extends Stack {
  constructor(scope: Construct, id: string, props: SickoStackProps) {
    super(scope, id, props);

    const {
      siteUrl,
      domainName,
      googleClientId,
      googleSecretName,
      cognitoPrefix,
      sesFromEmail,
      authDomainName,
      authDomainLive,
    } = props;

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

    // The prefix domain, and it is never removed — not even once a custom
    // domain is serving. A pool may hold both, so keeping this one is what
    // makes `authDomainLive` a one-deploy switch in either direction rather
    // than a migration: the old address goes on working while traffic is on
    // the new one, and moving back needs no domain to be torn down. It is also
    // the fallback the app lands on if the custom domain is ever removed.
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
          // Google says whether it has verified the address and the pool has no
          // other way to learn it: `autoVerify` sends a code, and a federated
          // user is never asked for one, so without this mapping every Google
          // account lands with `email_verified: false` — checked against the
          // live pool, all three of them. It rides in the ID token, and it is
          // what Cognito consults when an address arrives twice (someone who
          // signed up with a password and later presses Continue with Google).
          // `custom` is only how CDK spells a destination attribute it has no
          // named field for; both of these are standard ones.
          custom: {
            email_verified: cognito.ProviderAttribute.other('email_verified'),
            // Already what the live provider has (`username: sub`), added by
            // Cognito rather than by this template — which is exactly why it is
            // written out now. CloudFormation replaces `AttributeMapping`
            // wholesale, so a template that names two attributes where the
            // provider holds three is an update that could drop the third; and
            // the third is the one that decides a federated user's username, so
            // dropping it risks every existing Google account coming back as
            // somebody new. Stating it makes the update a strict superset.
            username: cognito.ProviderAttribute.other('sub'),
          },
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

    const prefixDomain = `${cognitoPrefix}.auth.${this.region}.amazoncognito.com`;

    // A custom domain is only built when `domainName` supplies a zone to
    // validate a certificate against and write records into.
    const authDomain = domainName && authDomainName ? authDomainName : undefined;

    /**
     * The host every sign-in actually goes through — what `/config.json` hands
     * the client and what the server reports.
     *
     * Both branches are plain strings known at synth time rather than
     * references to the domain resources, which is what lets this be decided
     * here, high up, while the custom domain itself is created much further
     * down (it has to be, so it can depend on the apex A record — see there).
     */
    const cognitoDomain = authDomain && authDomainLive ? authDomain : prefixDomain;

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
    // Captured because Cognito refuses to create a custom domain unless the
    // *parent* of that domain already resolves — see the block below.
    let apexARecord: route53.ARecord | undefined;
    if (zone && domainName) {
      const target = route53.RecordTarget.fromAlias(
        new r53targets.CloudFrontTarget(distribution),
      );
      for (const [id, recordName] of [
        ['Apex', undefined],
        ['Www', `www.${domainName}`],
      ] as const) {
        const a = new route53.ARecord(this, `Alias${id}`, { zone, recordName, target });
        if (id === 'Apex') apexARecord = a;
        // CloudFront answers on IPv6 by default; without this record an
        // IPv6-only client can't resolve the site at all.
        new route53.AaaaRecord(this, `Alias${id}V6`, { zone, recordName, target });
      }
    }

    /**
     * Cognito's own pages, served from a subdomain of the site.
     *
     * Built whenever `authDomainName` is set; *used* only when
     * `authDomainLive` is too. See both props for why that is two flags, and
     * for the iOS Google sign-in failure this is a candidate remedy for.
     *
     * Its own certificate rather than a SAN on `SiteCert`, deliberately.
     * Adding a name to that certificate replaces it, and replacing it updates
     * the distribution serving the whole site — so a change made to fix
     * sign-in would put the site's own TLS in the blast radius. A separate
     * certificate keeps the failure contained to the thing being changed, and
     * costs nothing: ACM certificates are free and this one validates against
     * the same zone.
     */
    if (zone && domainName && authDomain) {
      const authCert = new acm.Certificate(this, 'AuthCert', {
        domainName: authDomain,
        validation: acm.CertificateValidation.fromDns(zone),
      });

      const authUserPoolDomain = userPool.addDomain('AuthDomain', {
        customDomain: { domainName: authDomain, certificate: authCert },
      });

      // Cognito verifies that the parent domain resolves before it will create
      // a custom domain — "to protect against accidental hijacking of
      // production domains" — and an SOA record is explicitly not enough. On
      // this account the apex has resolved for a long time, so nothing would
      // race today; but a deploy into an empty account creates both in the
      // same changeset, and without this the custom domain can be attempted
      // first and fail on a parent that doesn't exist yet. Declaring it is
      // what keeps a from-scratch deploy working.
      if (apexARecord) authUserPoolDomain.node.addDependency(apexARecord);

      const authTarget = route53.RecordTarget.fromAlias(
        new r53targets.UserPoolDomainTarget(authUserPoolDomain),
      );
      new route53.ARecord(this, 'AuthAlias', {
        zone,
        recordName: authDomain,
        target: authTarget,
      });
      // AWS's own walkthrough writes only the A record, and following it would
      // have been a regression: the prefix domain this replaces *does* answer
      // on IPv6 (measured — `baseball-sicko.auth.us-east-1.amazoncognito.com`
      // returns three AAAA records), so an A-only alias would leave an
      // IPv6-only client able to load the app and unable to sign in with
      // Google. Cognito's distribution is managed and not ours to configure,
      // so this is best-effort: if it ever has no IPv6, the alias answers
      // NODATA and a dual-stack client falls back to the A record above.
      new route53.AaaaRecord(this, 'AuthAliasV6', {
        zone,
        recordName: authDomain,
        target: authTarget,
      });
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
    // Both, when there are two, and that is the point rather than tidiness:
    // the Google OAuth client must list *every* host that can ever send it a
    // request, and the prefix domain goes on being one for as long as
    // `authDomainLive` can be turned back off. Listing only the live one would
    // make the rollback the thing that breaks sign-in.
    new CfnOutput(this, 'GoogleRedirectUri', {
      value: authDomain
        ? [prefixDomain, authDomain].map((d) => `https://${d}/oauth2/idpresponse`).join(' , ')
        : `https://${prefixDomain}/oauth2/idpresponse`,
      description:
        'Authorized redirect URI(s) on the Google OAuth client. Add, never replace: ' +
        'every host listed here must stay listed while it can still serve a sign-in.',
    });
    new CfnOutput(this, 'AuthDomainStatus', {
      value: !authDomain
        ? `Sign-in goes through ${prefixDomain}. No custom auth domain configured.`
        : authDomainLive
          ? `Sign-in goes through ${authDomain}. Roll back by re-deploying without -c authDomainLive=true`
          : `${authDomain} is built and idle; sign-in still goes through ${prefixDomain}. ` +
            `Add https://${authDomain}/oauth2/idpresponse to the Google OAuth client, ` +
            'then re-deploy with -c authDomainLive=true',
      description: 'Which host Cognito serves sign-in from, and what the next step is',
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
