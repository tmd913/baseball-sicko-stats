/**
 * Cognito, spoken to directly.
 *
 * The app used to hand sign-in over to Cognito's hosted UI and let
 * oidc-client-ts drive the OAuth code flow. That is gone for email/password:
 * every one of those flows — sign up, confirm, sign in, forgot password — is
 * an ordinary JSON POST to the Cognito Identity Provider endpoint, needs no
 * request signing at all for a public app client, and needs no dependency
 * either. Owning them is what buys the app its own sign-in screen, and with it
 * error messages phrased for a person rather than for an API.
 *
 * Google is the exception and always will be: federating means the browser has
 * to visit Cognito, so that one path still redirects (see `googleSignInUrl`) —
 * but only that one, and the tokens it comes back with are refreshed and
 * revoked through the same two calls as everyone else's.
 *
 * Nothing here touches storage or React; `auth.tsx` owns both.
 */

export interface CognitoConfig {
  region: string;
  clientId: string;
  /** Hosted-UI domain. Only Google needs it, so it may be absent. */
  cognitoDomain: string | null;
}

/** What a successful authentication yields. `refreshToken` is absent from the
 *  response to a *refresh*, which is why it's nullable here and merged rather
 *  than replaced by the caller. */
export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. Derived from `ExpiresIn` at the moment the response landed. */
  expiresAt: number;
}

/**
 * A Cognito error that kept its type name.
 *
 * The code is what the caller branches on — `UserNotConfirmedException` sends
 * someone to the confirmation screen rather than showing them a failure — and
 * `message` is already phrased for the user by `friendly()`.
 */
export class CognitoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoError';
    this.code = code;
  }
}

/**
 * Cognito's own wording, replaced where it is unhelpful and kept where it is
 * not.
 *
 * `InvalidPasswordException` and `InvalidParameterException` are the two that
 * are worth keeping: they say exactly which rule the password broke, which is
 * more use than anything that could be written here. The rest are either
 * jargon ("User is not confirmed") or, in the case of a bad password, worded
 * for an API rather than for someone who has just mistyped.
 */
function friendly(code: string, message: string): string {
  switch (code) {
    case 'NotAuthorizedException':
      // Also raised for a disabled account and a dead refresh token, both of
      // which carry a message worth showing as-is.
      return /incorrect username or password/i.test(message)
        ? 'Incorrect email or password.'
        : message;
    case 'UserNotFoundException':
      return "We couldn't find an account with that email.";
    case 'UsernameExistsException':
      return 'An account with that email already exists. Try signing in.';
    case 'UserNotConfirmedException':
      return 'This email still needs confirming.';
    case 'CodeMismatchException':
      return "That code isn't right. Check it and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired — send yourself a new one.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Wait a minute and try again.';
    case 'CodeDeliveryFailureException':
      return "We couldn't send the email. Check the address and try again.";
    case 'InvalidPasswordException':
    case 'InvalidParameterException':
      return message;
    case 'NetworkError':
      return "Couldn't reach the sign-in service. Check your connection.";
    default:
      return message || 'Something went wrong. Try again.';
  }
}

/**
 * One POST to the Cognito Identity Provider endpoint.
 *
 * These are the unauthenticated operations of a client with no secret, so
 * there is no SigV4 signing to do — the whole protocol is a target header and
 * a JSON body.
 */
async function call<T>(config: CognitoConfig, target: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CognitoError('NetworkError', friendly('NetworkError', ''));
  }

  const text = await res.text();
  const parsed: unknown = text ? safeParse(text) : null;

  if (!res.ok) {
    const err = (parsed ?? {}) as { __type?: string; message?: string; Message?: string };
    // `__type` arrives either bare or namespaced (`com.amazon.coral.service#…`).
    const code = (err.__type ?? 'UnknownError').split('#').pop() ?? 'UnknownError';
    throw new CognitoError(code, friendly(code, err.message ?? err.Message ?? ''));
  }
  return (parsed ?? {}) as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface AuthResponse {
  AuthenticationResult?: {
    IdToken: string;
    AccessToken: string;
    RefreshToken?: string;
    ExpiresIn: number;
  };
  ChallengeName?: string;
}

function toTokens(res: AuthResponse): Tokens {
  const r = res.AuthenticationResult;
  if (!r) {
    // The pool asks for no challenges (no MFA, no forced password change), so
    // reaching here means the configuration has changed underneath the client
    // rather than that the user did something wrong.
    throw new CognitoError(
      'ChallengeRequired',
      `This account needs a step this app can't do yet (${res.ChallengeName ?? 'unknown'}).`,
    );
  }
  return {
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken ?? null,
    expiresAt: Date.now() + r.ExpiresIn * 1000,
  };
}

/**
 * Email + password.
 *
 * `USER_PASSWORD_AUTH` sends the password to Cognito inside the TLS body,
 * where SRP would prove knowledge of it without transmitting it. That is the
 * one thing given up by leaving the hosted UI, and it is a smaller thing than
 * it sounds: the hosted UI posted the same password over the same TLS to the
 * same service. SRP needs a big-integer handshake and ~200 KB of dependency to
 * do it correctly, and a subtle bug in a hand-rolled one fails *open*. If that
 * trade ever stops being worth it, `amazon-cognito-identity-js` is the drop-in
 * — this module's surface is shaped so only its body has to change.
 */
export function signIn(config: CognitoConfig, email: string, password: string): Promise<Tokens> {
  return call<AuthResponse>(config, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }).then(toTokens);
}

/**
 * A new access/ID token from the refresh token.
 *
 * One path for every user however they signed in: a refresh token minted by
 * the hosted UI's code exchange is an ordinary refresh token for the same app
 * client, so a Google session renews through this call too.
 */
export function refresh(config: CognitoConfig, refreshToken: string): Promise<Tokens> {
  return call<AuthResponse>(config, 'InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: config.clientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  }).then(toTokens);
}

export interface SignUpResult {
  /** True when the pool didn't ask for a code — then sign-in can go straight
   *  through instead of stopping at the confirmation screen. */
  confirmed: boolean;
  /** Where Cognito says it sent the code, already masked (`t***@g***.com`). */
  destination: string | null;
}

export function signUp(
  config: CognitoConfig,
  email: string,
  password: string,
): Promise<SignUpResult> {
  return call<{ UserConfirmed?: boolean; CodeDeliveryDetails?: { Destination?: string } }>(
    config,
    'SignUp',
    {
      ClientId: config.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    },
  ).then((r) => ({
    confirmed: Boolean(r.UserConfirmed),
    destination: r.CodeDeliveryDetails?.Destination ?? null,
  }));
}

export function confirmSignUp(
  config: CognitoConfig,
  email: string,
  code: string,
): Promise<unknown> {
  return call(config, 'ConfirmSignUp', {
    ClientId: config.clientId,
    Username: email,
    ConfirmationCode: code,
  });
}

export function resendCode(config: CognitoConfig, email: string): Promise<string | null> {
  return call<{ CodeDeliveryDetails?: { Destination?: string } }>(
    config,
    'ResendConfirmationCode',
    { ClientId: config.clientId, Username: email },
  ).then((r) => r.CodeDeliveryDetails?.Destination ?? null);
}

export function forgotPassword(config: CognitoConfig, email: string): Promise<string | null> {
  return call<{ CodeDeliveryDetails?: { Destination?: string } }>(config, 'ForgotPassword', {
    ClientId: config.clientId,
    Username: email,
  }).then((r) => r.CodeDeliveryDetails?.Destination ?? null);
}

export function confirmForgotPassword(
  config: CognitoConfig,
  email: string,
  code: string,
  password: string,
): Promise<unknown> {
  return call(config, 'ConfirmForgotPassword', {
    ClientId: config.clientId,
    Username: email,
    ConfirmationCode: code,
    Password: password,
  });
}

/**
 * Invalidate a refresh token server-side.
 *
 * Signing out clears local storage either way, so this is about the copy
 * Cognito would otherwise keep honoring for a year. It's best-effort by
 * design: the caller must not leave someone signed in because a revoke call
 * failed.
 */
export function revokeToken(config: CognitoConfig, refreshToken: string): Promise<unknown> {
  return call(config, 'RevokeToken', { ClientId: config.clientId, Token: refreshToken });
}

/* ---- Google, which has to go through the hosted UI ---------------------- */

const PKCE_KEY = 'sicko:pkce';

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Where the browser comes back to. Always the site root — the app keeps its
 *  own state in the query string and restores it separately. */
export function redirectUri(): string {
  return `${window.location.origin}/`;
}

/**
 * The authorize URL for a federated sign-in, with the PKCE verifier and state
 * stashed for the return leg.
 *
 * `identity_provider=Google` is what skips the hosted UI's own account picker:
 * the browser lands on Google, not on a Cognito page offering a form this app
 * now draws itself.
 */
export async function googleSignInUrl(config: CognitoConfig): Promise<string> {
  if (!config.cognitoDomain) throw new Error('no hosted-UI domain configured');
  const verifier = randomString();
  const state = randomString();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    identity_provider: 'Google',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://${config.cognitoDomain}/oauth2/authorize?${params}`;
}

/**
 * The `?error=` half of the redirect — a round trip that came back having
 * failed rather than having succeeded.
 *
 * It is read *before* `exchangeCode`, and separately from it, because the two
 * are different facts: this load carries no `code` at all, so an exchange has
 * nothing to attempt and would report "not a callback" — which is how a failed
 * federated sign-in used to arrive at the sign-in card with no message on it
 * and `?error=…` still in the address bar. Pure: it consumes nothing, so the
 * caller may ask twice.
 */
export function oauthError(): CognitoError | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return null;
  return new CognitoError(error, friendlyOAuth(error, params.get('error_description') ?? ''));
}

/**
 * OAuth's error codes are for a client library, not for a person, and Cognito's
 * `error_description` is frequently its own "Something went wrong" — so the two
 * that mean something specific are named and the rest say the one useful thing,
 * which is that pressing the button again generally works.
 */
function friendlyOAuth(error: string, description: string): string {
  switch (error) {
    case 'access_denied':
      return 'Google sign-in was canceled.';
    case 'invalid_request':
    case 'server_error':
    case 'temporarily_unavailable':
      return "Google sign-in didn't finish. Try it again.";
    default:
      return description || "Google sign-in didn't finish. Try it again.";
  }
}

/**
 * The `?code=` half of the redirect, exchanged for tokens.
 *
 * Returns null when this load isn't a callback at all, which is the usual
 * case — the caller runs it unconditionally at boot.
 *
 * A `code` with **no stashed verifier** is the one shape that is neither: it is
 * a callback this tab cannot complete (the redirect began somewhere else, or a
 * `?code=` was pasted or bookmarked). It throws rather than answering null,
 * because null means "there was nothing here" and would leave the code sitting
 * in the address bar under a sign-in card that says nothing happened.
 */
export async function exchangeCode(config: CognitoConfig): Promise<Tokens | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !config.cognitoDomain) return null;

  const stashed = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (!stashed) {
    throw new CognitoError(
      'SignInInterrupted',
      "Sign-in couldn't be completed in this tab. Try signing in again.",
    );
  }
  const { verifier, state: expected } = JSON.parse(stashed) as {
    verifier: string;
    state: string;
  };
  // A mismatched state is the one case worth failing loudly on: it means this
  // code didn't come from a redirect this tab started.
  if (state !== expected) throw new CognitoError('StateMismatch', 'Sign-in could not be verified.');

  const res = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  const body = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.id_token || !body.access_token) {
    throw new CognitoError(
      body.error ?? 'TokenExchangeFailed',
      body.error_description ?? 'Sign-in could not be completed.',
    );
  }
  return {
    idToken: body.id_token,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

/**
 * Cognito's logout endpoint, which clears the *hosted* session cookie.
 *
 * Only a federated user needs it, and even then only so that signing out and
 * back in shows Google's account chooser rather than silently re-authing the
 * same account. Note its parameters are Cognito's own (`logout_uri`), not
 * OIDC's `post_logout_redirect_uri` — sending the standard spelling is what
 * used to make signing out land on a Cognito error page.
 */
export function logoutUrl(config: CognitoConfig): string | null {
  if (!config.cognitoDomain) return null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: redirectUri(),
  });
  return `https://${config.cognitoDomain}/logout?${params}`;
}

/** The claims the app reads off an ID token. Signature verification is the
 *  server's job (`server/src/auth.ts`); this is only for showing an email. */
export function decodeClaims(idToken: string): { email?: string; exp?: number } {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return {};
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    // Decoded as UTF-8 rather than through `atob` alone: a name or an email
    // with an accent in it is multi-byte, and the raw binary string would
    // mangle it.
    return JSON.parse(new TextDecoder().decode(bytes)) as { email?: string; exp?: number };
  } catch {
    return {};
  }
}
