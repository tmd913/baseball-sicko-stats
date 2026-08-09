---
name: deploy
description: Deploy Statcast Sicko to AWS — build, cdk deploy, invalidate CloudFront, verify the live site actually renders. Use when asked to deploy, ship, push to prod, or release, or to redeploy after a change. Also covers checking whether the live site is running current code.
---

# Deploy Statcast Sicko

One CDK stack (`BaseballSicko`, account 719807587463, us-east-1) serves the whole
app: CloudFront + S3 for the client, API Gateway + Lambda for the server. A deploy
is **one pass** — build, `cdk deploy`, invalidate, verify.

Run every command from the **repo root**. `npm run cdk` already forwards into
`infra/`; do not `cd infra` and do not run bare `cdk` (it isn't on PATH — `npx cdk`
or the npm script only).

## 0. Preflight

```bash
aws sts get-caller-identity
```

If it prints `Your session has expired` or any credential error, **stop and ask the
user to run `! aws login` in the session** — it is an interactive browser flow and
cannot be done for them. Everything below fails without it.

Then check the tree is in the state they mean to ship:

```bash
git status --short && git log --oneline -1
```

Uncommitted changes still deploy (the build reads the working tree, not HEAD).
Mention what's dirty and which commit is at HEAD, then continue — don't block on it,
and don't commit on their behalf unless asked.

## 1. Build

```bash
npm run build
```

This is `tsc -b && vite build` for the client, then `tsc` for the server. It is the
only typecheck in the repo — there is no test runner and no linter. **A failed build
stops the deploy**; fix it or report it, never deploy past it.

## 2. See what infrastructure changes (optional but cheap)

```bash
npm run cdk -- diff
```

Worth doing when `infra/` changed, when it's been a while, or when the user asks
what a deploy would do. Pure client/server code changes usually show only the Lambda
asset hash and the `BucketDeployment` — that's the normal, boring diff. Anything
touching Cognito, the distribution, DynamoDB or the cache bucket deserves a sentence
to the user before you proceed.

## 3. Deploy

```bash
npm run cdk -- deploy --require-approval never
```

Takes several minutes. **Never pass `-c siteUrl=`** — `siteUrl` in `infra/cdk.json`
now means *the legacy CloudFront origin to keep signable-in*, and overriding it on
the CLI silently drops that Cognito callback. All deployment context
(`domainName`, `googleClientId`, `cognitoPrefix`, `googleSecretName`) is pinned in
`infra/cdk.json`; the old two-pass `siteUrl` dance is gone because the custom domain
makes the origin knowable up front.

## 4. Invalidate CloudFront

```bash
aws cloudfront create-invalidation --distribution-id E3EAGWVOLAMP1T --paths "/*"
```

**Required, not optional.** `BucketDeployment` uploads the new bundle but does not
invalidate, so without this the edge keeps serving the old `index.html` and users see
no change at all.

## 5. Verify — the part that actually matters

`npm run build` succeeds on a broken bundle and `curl` returns 200 with an empty
`#root` whether or not React ran. A react/react-dom version mismatch has shipped
past both. So verify twice:

**a) The new bundle is live** — compare the hash you just built against what the edge
serves:

```bash
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' client/dist/index.html
curl -s https://statcastsicko.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

They must match. If they don't, the invalidation hasn't propagated — wait ~30s and
re-check before concluding anything.

**b) The page renders** — headless, dumping the DOM and watching the console:

```bash
~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --headless --disable-gpu --virtual-time-budget=15000 \
  --dump-dom https://statcastsicko.com/ 2>&1 \
  | tee /tmp/deploy-render.txt | grep -c 'auth-screen'
grep -ic 'CONSOLE.*ERROR' /tmp/deploy-render.txt
```

A healthy signed-out render prints `1` then `0`: `.auth-screen` markup landed
**inside `#root`**, and the console carried no errors. `0` from the first grep means
the bundle is broken even though every step above "succeeded" — say so plainly rather
than reporting success. `--virtual-time-budget` is required; without it you capture
the loading state. (Both greps are verified against the live site; see
[[mobile-screenshot-workflow]] in memory for the fuller CDP-driving version if you
need to reach state that has no URL behind it.)

Also hit the API, which is a separate Lambda from the static site:

```bash
curl -s https://statcastsicko.com/api/health
```

`/api/health` and `/api/config` are the only unauthenticated routes; everything else
401s without a Cognito token, which is correct, not a failure.

## Reporting

Tell the user: what got deployed (commit + whether the tree was dirty), the bundle
hash now live, that the invalidation went out, and the result of both verification
checks. If a step failed, say which one and show the output — a deploy that built and
uploaded but renders a blank page is a failed deploy.

## Deployment coordinates

| Thing | Value |
|---|---|
| Stack | `BaseballSicko` (CloudFormation, us-east-1) |
| Account | 719807587463 |
| Site | https://statcastsicko.com (`www` 301s to apex) |
| CloudFront | `E3EAGWVOLAMP1T` — `d18r33h6h98ev9.cloudfront.net` still serves the app |
| Hosted zone | `Z097056114SYGF3IP4JZZ` |
| Cognito | pool `us-east-1_BpmmvL5PV`, client `23jb45dl30b0if13k7b5vp6lki`, hosted UI `baseball-sicko.auth.us-east-1.amazoncognito.com` |
| Google IdP secret | Secrets Manager `baseball-sicko/google-oauth` (plaintext, not JSON) |

## Rollback

There is no one-command rollback. Check out the last known-good commit and run this
skill again from step 1 — the deploy is fully derived from the working tree.

## Known traps

- **`cdk deploy` with no credentials** fails late and noisily. Do step 0 first.
- **Skipping the invalidation** is the single most common way a "successful" deploy
  changes nothing for the user.
- **`-c siteUrl=…`** drops the legacy CloudFront Cognito callback. Never pass it.
- **A wide report exceeds Lambda's 6 MB response cap uncompressed** — `compression()`
  in the server is load-bearing, and `lambda.ts` must keep marking JSON/text as
  `binary`. If a report 502s in prod but works locally, look there first.
- **CDK bundling needs `bundleAwsSDK: true`** — `@aws-sdk/lib-dynamodb` is not in the
  Lambda runtime SDK, and leaving it external is `MODULE_NOT_FOUND` on the first
  watchlist read.
- **The season is hardcoded in six places** (`savant.ts`, `percentiles.ts`,
  `xwoba.ts`, `pitcherArsenal.ts`, `teamStats.ts`, `expectedStats.ts`). If a deploy
  is meant to roll the season over, confirm all six changed before shipping.
