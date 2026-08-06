import serverlessHttp from 'serverless-http';
import app from './index.js';

/**
 * The Lambda entry point. `serverless-http` adapts an API Gateway event into the
 * `(req, res)` pair Express expects, so this works with Express 5 unchanged.
 *
 * `binary` matters: `compression()` gzips the report, and a gzipped body has to
 * be base64-encoded on the way back through API Gateway or it arrives corrupt.
 * Listing the content types we actually serve (rather than '*\/*') keeps plain
 * error responses readable in the console.
 */
export const handler = serverlessHttp(app, {
  binary: ['application/json', 'text/*', 'application/javascript'],
});
