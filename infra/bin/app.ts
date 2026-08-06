#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { SickoStack } from '../lib/stack.js';

const app = new App();

/** Context, so nothing has to be edited to deploy: pass with `-c key=value`. */
const ctx = (key: string): string | undefined => {
  const v = app.node.tryGetContext(key);
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

new SickoStack(app, ctx('stackName') ?? 'BaseballSicko', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // CloudFront and its certs are us-east-1 concerns, and both upstreams
    // (statsapi / baseballsavant) are US-hosted.
    region: ctx('region') ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  // Empty on the first deploy — see the note on SickoStackProps.siteUrl.
  siteUrl: ctx('siteUrl'),
  googleClientId: ctx('googleClientId'),
  googleSecretName: ctx('googleSecretName') ?? 'baseball-sicko/google-oauth',
  // Cognito hosted-UI prefixes are globally unique, so make it easy to change.
  cognitoPrefix: ctx('cognitoPrefix') ?? 'baseball-sicko',
  description: 'Statcast Sicko — API, watchlists, cache and static site',
});
