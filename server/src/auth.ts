import type { NextFunction, Request, Response } from 'express';

/**
 * Resolving which user a request belongs to.
 *
 * Deployed, `USER_POOL_ID` is set and the bearer token is a Cognito ID token —
 * verified here, with `sub` as the user id. Locally the variable is unset and
 * every request is the same single dev user, so `npm run dev` needs no AWS and
 * no login at all.
 *
 * API Gateway also carries a JWT authorizer, which rejects unauthenticated
 * traffic before it ever reaches Lambda. This middleware is not redundant with
 * it: the authorizer is an edge filter, while this is the single place that
 * decides *which* user a request is for, shared by the local server, the Lambda
 * and the warmer.
 */

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
/** The user every request belongs to when auth is off (local dev). */
export const DEV_USER_ID = process.env.DEV_USER_ID ?? 'local';

export const authEnabled = USER_POOL_ID !== undefined;

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

interface Verifier {
  verify(token: string): Promise<{ sub: string }>;
}

/** Built once per container. `aws-jwt-verify` fetches and caches the pool's
 *  JWKS on first use, so the cost is one request per cold start. */
let verifierPromise: Promise<Verifier> | null = null;

function verifier(): Promise<Verifier> {
  if (verifierPromise) return verifierPromise;
  verifierPromise = (async () => {
    const { CognitoJwtVerifier } = await import('aws-jwt-verify');
    return CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID!,
      tokenUse: 'id',
      clientId: CLIENT_ID!,
    }) as unknown as Verifier;
  })();
  return verifierPromise;
}

function bearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!/^bearer$/i.test(scheme ?? '') || !token) return null;
  return token;
}

/** Populates `req.userId`, or 401s. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled) {
    req.userId = DEV_USER_ID;
    next();
    return;
  }
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  verifier()
    .then((v) => v.verify(token))
    .then((payload) => {
      req.userId = payload.sub;
      next();
    })
    .catch((err: unknown) => {
      console.error('token verification failed:', err);
      // 401 rather than 403: the client's retry path is to refresh the token.
      res.status(401).json({ error: 'invalid or expired token' });
    });
}

/** `req.userId` after `requireUser` has run. */
export function userId(req: Request): string {
  const id = req.userId;
  if (!id) throw new Error('requireUser did not run for this route');
  return id;
}
