### Deployment (`infra/`, a CDK app)

S3 + CloudFront for the client, Lambda behind an API Gateway HTTP API for the server, S3 for the cache, DynamoDB for watchlists, Cognito (self-signup + optional Google) for sign-in. `server/src/lambda.ts` wraps the Express app in `serverless-http`; `index.ts` guards `express.static` and `app.listen` behind `!IS_LAMBDA` and exports the app.

- `/api/*` is a CloudFront **behavior** over the same distribution, so the client stays same-origin and there is **no CORS**. That behavior needs `ALL_VIEWER_EXCEPT_HOST_HEADER` — CloudFront strips `Authorization` by default and every request would 401.
- **`compression()` is required, not an optimisation.** A wide-range report exceeds Lambda's 6 MB response cap uncompressed, and nothing downstream can compress on our behalf (the cap applies before CloudFront sees the response). `lambda.ts` marks JSON/text as `binary` so gzipped bodies are base64-encoded rather than corrupted.
- CDK bundling sets **`bundleAwsSDK: true`**. The default leaves `@aws-sdk/*` external, but `@aws-sdk/lib-dynamodb` is *not* in the Lambda runtime's SDK — leaving it external is a `MODULE_NOT_FOUND` on the first watchlist read.
- The client learns its Cognito config from **`/config.json`**, written into the site bucket by `BucketDeployment` via `Source.jsonData`, so one build works in any environment. `client/src/auth.tsx` skips auth entirely when that file is absent or has no user pool.
- **Two-pass first deploy — only without a custom domain.** Cognito's callback URL needs the CloudFront domain → distribution → API → authorizer → user pool client is a cycle, so `siteUrl` comes from CDK **context** instead. Deploy, read the `NextStep` output, deploy again with `-c siteUrl=…`.
- **Custom domain** (`domainName` in `cdk.json` context, `statcastsicko.com`). Supplying it collapses that to one pass: the origin is known before anything is created, so `app.ts` derives `siteUrl` from it and the `NextStep` output disappears. The stack then imports the **existing** hosted zone (`HostedZone.fromLookup` — Route 53 creates one when the domain is registered; a second zone for the same name would serve records the registrar never delegates to), issues an ACM cert for apex + `www` validated against it, adds both as distribution aliases, and writes A **and AAAA** alias records for each. The lookup happens at *synth* time, so **the zone must exist before `cdk deploy`** — with no zone, synth fails with `Found zones: []` rather than deploying anything. The cert has to be in **us-east-1**, which is where this stack already lives. Cognito keeps the `*.cloudfront.net` callback alongside the custom one, since both still resolve to the same distribution. **`www` 301s to the apex** via a CloudFront Function (`infra/lib/redirect-to-apex.js`, viewer-request on the *default* behavior only — a 301 on a non-idempotent `/api/*` call is a footgun, and the document request redirects first so nothing the client issues is ever aimed at `www`). The redirect is an **auth** fix as much as a canonical-URL one: the two hosts are separate browser origins with separate localStorage, which is where the OIDC session lives, so serving both meant signing in once per host with nothing on screen to explain why. It **rebuilds the query string by hand** — `App.tsx` keeps the whole view in it, and CloudFront hands the params over decoded and splits a repeated key (`expanded`) into `multiValue`, so a naive pass-through would drop every repeat and mangle any encoded value. `www` still needs its alias records, cert SAN and distribution alias: without all three the redirect can't be reached over HTTPS and the visitor gets a cert warning instead. Its Cognito callback URL is kept too, unreachable but ready if the redirect is ever removed.
- Two EventBridge rules run `warmer.ts`: `live` every 5 min (today + yesterday) and `backfill` nightly (last 7 days + per-player season data + the season roster).
- **Per-route timing lives in two log groups**, the stage's access log and the server's own request line, for reasons that are the whole of the last section in this file. Neither alone can name the route in a request that times out.

### Cognito's own pages can move to `auth.statcastsicko.com`

**Google sign-in fails intermittently, on iOS only, and this is the candidate remedy.** The trace is in CloudTrail rather than inferred from a report: on 2026-08-14 at 19:33:16 UTC an `OAuth2_Authorize_GET` with `identity_provider=Google` 302s to Google, six seconds later `OAuth2Response_GET` comes back **"Something went wrong. Please try again."**, and `Login_GET` answers **401** — the hosted page the user was left staring at. The retry made *from that page* sixteen seconds later succeeds and creates the federated user. All three recorded occurrences (08-08, 08-09, 08-14) are iOS; **no desktop attempt has ever failed**. Every other candidate was ruled out against the live pool: the callback URLs include the apex, the OAuth flows and scopes are right, the IdP maps `email`, and the pool's only Lambda trigger has never been invoked.

**The cause is inferred and the remedy is a guess with good odds, which is why it is built to be reversed.** That shape — one leg failing on WebKit, succeeding on retry from the provider's own page — is what a cross-site cookie mitigation produces on a hop through `*.amazoncognito.com`, a domain the `identity_provider=Google` short-circuit gives the user no interaction with and which is third-party to the site throughout. Serving the same pages from a subdomain of the site makes the hop same-site. It could not be proved: Cognito publishes no detail for that leg (the pool is on the **ESSENTIALS** tier, where `userAuthEvents` log delivery is unavailable) and the failing leg could not be reproduced on demand. So this is a cheap thing to try, not a diagnosis, and nothing about it is one-way.

**Two flags, and the split is `sesFromEmail`'s.** `authDomainName` **builds** the certificate, the Cognito custom domain and its DNS records, and changes nothing about how anyone signs in; `authDomainLive` **moves traffic onto it** by pointing `/config.json`'s `cognitoDomain` (and the Lambda env, and the outputs) at it. Flipping both at once would put two things on the critical path of a single deploy that a deploy cannot verify: Cognito builds a CloudFront distribution for a custom domain and it takes time to propagate, and the **Google OAuth client must list the new `/oauth2/idpresponse` as an authorized redirect URI before any request is aimed at it** — a manual change in a console this stack has no access to, which Google documents as taking anywhere from five minutes to a few hours. The order is therefore: deploy with `authDomainName`, add the redirect URI in Google, let it propagate, deploy with `authDomainLive=true`. **That rollout has been done and both flags are now pinned in `infra/cdk.json`** — see the passage at the end of this file.

**The prefix domain is never removed, and that is what makes the rollback one deploy.** A user pool may hold both at once — AWS: *"You can have a custom domain and a prefix domain"* — so `baseball-sicko.auth.us-east-1.amazoncognito.com` goes on serving the whole time, and dropping `authDomainLive` moves sign-in straight back onto it without waiting for a domain to be torn down or a record to expire. The one documented difference is that Cognito serves `/.well-known/openid-configuration` for the **custom** domain only, and nothing here reads it: `client/src/cognito.ts` builds the authorize URL itself and posts to the Identity Provider endpoint directly, which is what dropping `oidc-client-ts` bought.

**The Google OAuth client must list both hosts, and the `GoogleRedirectUri` output prints both** once a custom domain is configured. Listing only the live one would make the *rollback* the thing that breaks sign-in — the prefix domain would start serving again with no redirect URI registered for it.

**Its own certificate rather than a SAN on `SiteCert`.** Adding a name to that certificate replaces it, and replacing it updates the distribution serving the whole site — so a change made to fix sign-in would put the site's own TLS in the blast radius. A separate certificate keeps the failure contained to the thing being changed, and ACM certificates are free.

**The alias is written as A *and* AAAA, where AWS's own walkthrough writes only the A record** — and following the walkthrough would have been a silent regression. Measured before deciding: the prefix domain this replaces **does** answer on IPv6 (`baseball-sicko.auth.us-east-1.amazoncognito.com` returns three AAAA records), so an A-only alias would leave an IPv6-only client able to load the app and unable to sign in with Google. Cognito's distribution is managed and not ours to configure, so the AAAA is best-effort: if it ever has no IPv6 the alias answers NODATA and a dual-stack client falls back to the A record.

**The custom domain depends on the apex A record explicitly.** Cognito refuses to create a custom domain unless the *parent* domain already resolves — "to protect against accidental hijacking of production domains", and an SOA record is explicitly not sufficient. On this account the apex has resolved for a long time so nothing would race today, but a deploy into an empty account creates both in one changeset and could attempt the domain first; the dependency is what keeps a from-scratch deploy working.

**Verified by synth and by `cdk diff` against the deployed stack.** Three states: with neither flag, one `AWS::Cognito::UserPoolDomain` (the prefix) and no `AuthCert`/`AuthAlias` at all, `config.json` naming the prefix domain, and a `cdk diff` whose only Cognito change is the `AttributeMapping` already pending from the Google-sign-in fix — i.e. **the default is a strict no-op**. With `authDomainName`, two domain resources coexist (prefix plus `auth.statcastsicko.com`), the custom one carrying `DependsOn: [AliasApex…]`, and `config.json` still naming the prefix. With both, `config.json` and both Lambdas' `COGNITO_DOMAIN` read `auth.statcastsicko.com`. One cosmetic note: `UserPoolDomainTarget` emits a deprecation warning for `cloudFrontDomainName` from inside `aws-cdk-lib` itself — it is CDK's call, not ours.

### The auth domain is live, and its flags are pinned rather than passed

**Rolled out 2026-08-14 in the two deploys the flags were built for**, and the intermediate state behaved as designed: with `authDomainName` alone the certificate issued in **2m35s**, the Cognito custom domain created in **2m40s** and both alias records in **32s** (6m05s in total), while `/config.json` went on naming the prefix domain and nothing about anyone's sign-in changed. The cutover deploy was **118s** and moved `cognitoDomain` to `auth.statcastsicko.com`.

**Two facts this file asserted from documentation are now measured.** A pool really does hold both at once — `describe-user-pool` returns `Domain: baseball-sicko` **and** `CustomDomain: auth.statcastsicko.com` — which is what makes the rollback a switch rather than a migration. And **Cognito's managed distribution does answer on IPv6**: `auth.statcastsicko.com` resolves to 4 A and **8 AAAA** records and returns 200 over `curl -6`. That is the measurement the AAAA record was added on the strength of, and it confirms that following AWS's own walkthrough — which writes only an A record — would have left IPv6-only clients able to load the app and unable to sign in with Google.

**The cutover was gated on Google rather than on Google's stated propagation window.** Google documents a redirect URI as taking five minutes to a few hours to propagate, which is not a thing to guess at, and it is directly testable once the domain is up but before the flip: drive a real `oauth2/authorize` through the **new** domain with `identity_provider=Google` and follow the 302. Google answered `<title>Sign in - Google Accounts</title>` rather than `redirect_uri_mismatch`, so the URI was live. The **old** URI was checked the same way in the same minute and still answered — which is what proves the redirect URI was *added* rather than replaced, and so that the rollback path is real rather than assumed. Do both before any future cutover of this kind; a `redirect_uri_mismatch` discovered after the flip is a broken sign-in for everyone using that provider.

**The flags are in `infra/cdk.json` because a deploy that forgets them would silently revert the cutover.** They were `-c` arguments during the rollout, which is right while a change is being tried and wrong once it has landed: `cdk.json` is what every future `npm run cdk -- deploy` reads, and this repo's own deploy procedure passes no context at all. Pinning them was verified the only way that means anything — **`cdk diff` with no flags against the deployed stack reports "There were no differences"**, so the pinned file reproduces exactly what is live and the pin needed no deploy of its own.

**Rolling back does not need the file edited.** CLI context beats `cdk.json`, so `-c authDomainLive=false` is enough to put sign-in back on the prefix domain on the next deploy (checked: the synthesized `config.json` reads `baseball-sicko.auth.us-east-1.amazoncognito.com` again). Follow it with a CloudFront invalidation, since `config.json` is served from the edge and is the file that carries the change. Editing the flag to `false` in `cdk.json` is the same thing made durable; removing `authDomainName` as well tears down the certificate, the domain and its DNS records, which is only worth doing if the remedy is being abandoned rather than paused.

**What is still unproven is whether any of it fixes the bug.** The iOS-only Google failure was diagnosed from three CloudTrail occurrences and a pattern (all iOS, all recovering on retry), not reproduced, and the ESSENTIALS tier publishes no detail for the failing leg. The hop is same-site now, which removes the suspected cause; only real traffic will say whether it was the cause. **A recurrence after this change is itself worth having** — it would be strong evidence the cookie theory was wrong, and the query that found it is `OAuth2Response_GET` events under `cognito-idp.amazonaws.com` with a non-success result.

### Per-route timing, in two log groups because one of them can't see the failures

**Nothing in this stack could say which route was slow.** Until 2026-08-31 the
Lambda logged no request line, the HTTP API's `$default` stage carried
`AccessLogSettings: null` and `DetailedMetricsEnabled: false`, and CloudFront
logging was `Enabled: false`. Three places a request's identity could have been
recorded, and none of them was recording it.

**What that hid, measured over the 7 days before the change** — 31,133
invocations of `ApiFunction`:

| | count | p50 | p90 | p99 |
| --- | --- | --- | --- | --- |
| `@initDuration` (cold only) | 2,248 (**7.2%**) | 519 ms | 556 ms | 619 ms |
| `@duration`, **warm** | 28,872 | 239 ms | 857 ms | 4,637 ms |
| `@duration`, **cold** | 2,259 | **1,368 ms** | 5,419 ms | 28,995 ms |

`@duration` **excludes** init, so the last two rows compare like with like: the
same work costs **5.7× more on a cold container**, because its ~30 module-scoped
`Map`s are empty and `storage.ts` has no memory layer, so every read a warm
container answers from process memory becomes an S3 round trip. **Part of that
5.7× is composition rather than cold-cache cost** — cold invocations cluster in
page-load bursts, which include the heavy routes, while warm ones include every
light 20 s poll; separating the two is the first thing the per-route lines are
for. Init at 519 ms is real either way but is **not** where the seconds go —
which is the opposite of what the untuned bundle settings suggest, and worth
knowing before optimizing them.

And **92 requests a week reach the 29 s wall** (Lambda `Errors` = 92,
`Throttles` = 0), **64 of them on cold containers** — 70% of the failures out of
7.2% of the traffic, so a cold container is ~28× likelier to time out. Peak
`ConcurrentExecutions` runs 22–44, which is one page load's fan-out: the client
fires ~25 parallel requests, Lambda answers with ~25 containers, and on a
low-traffic app most of them are new.

**Two log groups, because neither half can see what the other sees.**

- **The stage's access log** (`ApiAccessLog`, 30-day retention) is the half that
  **survives a timeout**. A request killed at the integration limit never
  reaches `res.on('finish')`, so the server's own line is missing for exactly
  the requests that matter most, and this is the only record they leave. It also
  sees what the Lambda never does: a request the JWT authorizer rejects logs
  `s=401` with **no `int` field at all**, because it was turned away before the
  integration ran.
- **The server's line** carries the **route pattern**, which the gateway cannot
  know — every request but `/api/health` and `/api/config` arrives at the same
  `ANY /{proxy+}` route, so `$context.routeKey` says `ANY /{proxy+}` for all
  ~79 of the others and only `$context.path` varies, which fragments
  `/api/players/12345/splits` from every other player.

**The format is JSON with the numeric fields written bare.** Quoting `status`
and the two latencies would land them as strings, and `pct()`/`sort` would then
be sorting text. The keys are declared once as an object and the three numeric
ones unquoted by `.replace()` on the serialized form, so the field names stay a
single source rather than being spelled twice.

**`integrationLatency` beside `responseLatency` is what separates a slow Lambda
from a slow gateway.** Measured on the first request after the deploy:
`ms: 766, int: 764` — a cold start, and the gateway's own share of it was 2 ms.

**`n` is an ordinal, not a cold/warm boolean.** It counts the request's position
on its container, and the boolean was rejected because it would collapse the
gradient worth seeing: those ~30 in-process `Map`s fill over the *first several*
requests, not the first one, so `n=1` and `n=8` are different amounts of S3 and
a flag cannot tell them apart.

**A breadcrumb fires at `SLOW_MS` (5 s) before the request finishes**, so a
request that never finishes still names its route. 5 s sits well past the
measured warm p90 of 857 ms, so it fires for the tail rather than for traffic.

**`qs` is the query string, and it is there because its absence cost an
afternoon.** `p` is `req.path` and drops it, so the Overview firing
`/api/overview` **three times on one boot** — 2026-09-01 at 16:35:51, +404ms,
+894 and +967, each on its own container and each taking 21 seconds — read in
the logs as three identical lines, and the logs could not say whether that was
three different questions or one asked three times. Answering it meant
reproducing the boot in a headless browser with the reads artificially
staggered. One field would have answered it.

**Its own field rather than folded into `p`,** because the two are read
differently: `p` and `r` are what you *group by* and want low cardinality, where
this is looked at one line at a time and would ruin a `by p` the moment it
carried a date. Absent entirely when there is no query, so the ordinary line
does not grow a `"qs":""`.

**`q=` is redacted to its length as sent** (`q=<16 chars>` for `walker
jenkins`). It is the one parameter in the whole API carrying free text a person
typed — the header search — where the rest are dates, ids and enum values the
app chose. Nothing here is a credential (checked: no route takes a token, a code
or a cookie in the query string), so this is not a security measure; it is that
a log of what somebody typed is a different kind of record from a log of what
the app asked for. **And it is capped at 200 characters**, because `ids=` and
`teams=` take lists — a 60-id request logs 200 and an ellipsis, a 25-player
roster fits whole.

It rides on the breadcrumb too, which is the line that matters most: a request
killed at the 29 s wall leaves nothing else, and `"t":"slow"` naming the route
without the parameters is half an answer. Both verified against a running
server at `SLOW_MS=150`.

#### Two things that would otherwise cost an afternoon

**HTTP APIs need no account-level CloudWatch role.** Almost everything written
about API Gateway access logging describes the REST/WebSocket requirement — an
IAM role trusted by `apigateway.amazonaws.com` set as `cloudWatchRoleArn` on
`AWS::ApiGateway::Account`. That does **not** apply here, and this account
proves it: `aws apigateway get-account` returns no `cloudwatchRoleArn` at all,
`AWSServiceRoleForAPIGateway` exists (trusted by `ops.apigateway.amazonaws.com`,
created 2023-01-28), and logs flowed on the first deploy.

**Logs Insights parses these lines with no `parse` step**, even though Lambda
prefixes each one with a timestamp, a request id and `INFO`. Auto-discovery
finds the JSON fields anyway, so `filter t="req" | stats … by r` works
directly. Writing the regex that *looks* necessary is the trap — a
`parse @message /(?<json>\{.*\})/` chain returns **no rows**.

```
filter t="req" | stats count(*) as n, pct(ms,50) as p50, pct(ms,99) as p99 by r | sort p99 desc
filter t="req" and n=1 | stats pct(ms,50) as coldP50 by r | sort coldP50 desc
filter t="slow" | stats count(*) as n by r | sort n desc
fields @timestamp, r, qs, ms, n, up | filter t="req" and ms > 5000 | sort ms desc
```

That last one is the shape the `qs` field was added for: the slowest reads with
enough of each to tell them apart. Group by `r`, read by `qs`.

**`ApiFunction`'s own log group is deliberately left alone.** It has
`retentionInDays: null` — never expire, 18 MB today, and the request lines add
roughly 4 MB a week, which is pennies. Adopting an implicitly-created log group
into CDK risks replacing it, and it holds the baseline above; the measurement is
worth more than the retention policy.
