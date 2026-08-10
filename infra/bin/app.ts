#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { SickoStack } from '../lib/stack.js';

const app = new App();

/** Context, so nothing has to be edited to deploy: pass with `-c key=value`. */
const ctx = (key: string): string | undefined => {
  const v = app.node.tryGetContext(key);
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

/** Set once the domain is registered and its hosted zone exists. */
const domainName = ctx('domainName');

new SickoStack(app, ctx('stackName') ?? 'BaseballSicko', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // CloudFront and its certs are us-east-1 concerns, and both upstreams
    // (statsapi / baseballsavant) are US-hosted.
    region: ctx('region') ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  // With a custom domain this is known up front and the second pass on
  // SickoStackProps.siteUrl disappears; without one it is empty on the first
  // deploy and fed back in as context on the second.
  siteUrl: ctx('siteUrl') ?? (domainName ? `https://${domainName}` : undefined),
  domainName,
  googleClientId: ctx('googleClientId'),
  googleSecretName: ctx('googleSecretName') ?? 'baseball-sicko/google-oauth',
  // Cognito hosted-UI prefixes are globally unique, so make it easy to change.
  // Only Google's redirect reaches it now — the app draws its own sign-in.
  cognitoPrefix: ctx('cognitoPrefix') ?? 'baseball-sicko',
  // Set this once SES has production access; until then the identity is
  // created and verified but Cognito keeps sending through its own shared
  // address. See SickoStackProps.sesFromEmail.
  sesFromEmail: ctx('sesFromEmail'),
  description: 'Statcast Sicko — API, watchlists, cache and static site',
});
