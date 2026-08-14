import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { setAuthToken, setReauthHandler } from './api';
import { LoadingLine, SpinningBaseball } from './components/Loading';
import {
  CognitoError,
  confirmForgotPassword,
  confirmSignUp,
  decodeClaims,
  exchangeCode,
  forgotPassword,
  googleSignInUrl,
  logoutUrl,
  oauthError,
  refresh as refreshTokens,
  resendCode,
  revokeToken,
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  type CognitoConfig,
  type Tokens,
} from './cognito';

/**
 * Sign-in, drawn by this app.
 *
 * Cognito's hosted UI used to own every screen here, reached by redirect and
 * driven by oidc-client-ts. Both are gone. The hosted UI cost the app three
 * things worth having back: a page that looks like the rest of it, error
 * messages written for a person, and a sign-out that doesn't leave the site
 * (see `signOut` — the redirect it used to make is what produced the error
 * people were hitting). What replaces it is `cognito.ts`, a handful of plain
 * JSON calls, and the token bookkeeping below.
 *
 * Google still redirects, because federating means the browser has to visit
 * the identity provider. It comes back with an ordinary Cognito refresh token,
 * so from the moment it lands there is one code path for everybody.
 *
 * The config is fetched at boot rather than baked in at build time, so one
 * built bundle works against any deployment. When `config.json` is absent or
 * has no user pool — which is the case for `npm run dev` — auth is skipped
 * entirely and the app renders as it always has.
 */

export interface AuthConfig {
  userPoolId: string | null;
  clientId: string | null;
  cognitoDomain: string | null;
  region: string | null;
}

/** Reads /config.json, falling back to "no auth" when it isn't there. */
export function useAuthConfig(): { config: AuthConfig | null; loading: boolean } {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/config.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((c: AuthConfig | null) => {
        if (!cancelled) setConfig(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}

export function authConfigured(config: AuthConfig | null): boolean {
  return Boolean(config?.userPoolId && config.clientId && config.region);
}

/* ---- The stored session ------------------------------------------------- */

const SESSION_KEY = 'sicko:session';

/**
 * The app's own query string, stashed across the Google redirect.
 *
 * `App` reads `window.location.search` on its first render and rewrites the
 * whole query on every state change, so a deep link would otherwise be lost
 * the moment we bounce through Cognito (and the returning `?code=…` would be
 * clobbered by App's rewrite). Only the federated path needs this — the
 * email/password screens never leave the page.
 */
const RETURN_KEY = 'sicko:return-query';

/**
 * The returning redirect, exchanged exactly once per page load.
 *
 * An authorization code is single-use and `exchangeCode` consumes the PKCE
 * verifier on the way in, so the boot effect must not be able to run it twice —
 * and under StrictMode it runs twice by design. The first pass used to take the
 * verifier and be cancelled, and the second found nothing stashed, answered
 * "not a callback" and dropped the user on the sign-in screen: Google sign-in
 * could not work at all under `npm run dev` against a real pool. A module-level
 * promise makes both passes await the same exchange, so whichever of them is
 * still live adopts the result.
 */
let bootExchange: Promise<Tokens | null> | null = null;

function exchangeOnce(config: CognitoConfig): Promise<Tokens | null> {
  bootExchange ??= exchangeCode(config);
  return bootExchange;
}

interface StoredSession extends Tokens {
  /** Set for a user who signed in through an external provider. Sign-out has
   *  to clear Cognito's hosted session cookie for them and only for them. */
  federated: boolean;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StoredSession>;
    if (!s.idToken || !s.accessToken || typeof s.expiresAt !== 'number') return null;
    return {
      idToken: s.idToken,
      accessToken: s.accessToken,
      refreshToken: s.refreshToken ?? null,
      expiresAt: s.expiresAt,
      federated: Boolean(s.federated),
    };
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode, a full quota — neither is worth failing sign-in over */
  }
}

/**
 * How long before expiry a token counts as due for renewal.
 *
 * Tokens last an hour, so a minute of slack costs nothing and covers both a
 * slow round trip and a clock that disagrees with Cognito's by a little.
 */
const RENEW_SKEW_MS = 60_000;
/** How often the wall clock is checked. A `setTimeout` would be tidier but
 *  sleeps through a closed laptop; polling notices on the next tick. */
const RENEW_POLL_MS = 30_000;

function isFresh(s: Tokens): boolean {
  return s.expiresAt - RENEW_SKEW_MS > Date.now();
}

/* ---- The gate ----------------------------------------------------------- */

type Phase = 'boot' | 'out' | 'in';

function Gate({ config, children }: { config: CognitoConfig; children: ReactNode }) {
  const [session, setSessionState] = useState<StoredSession | null>(null);
  const [phase, setPhase] = useState<Phase>('boot');
  /** Surfaced on the sign-in screen when a *redirect* failed — there is no
   *  form in flight to attach it to. */
  const [bootError, setBootError] = useState<string | null>(null);

  // Published during render, not from an effect.
  //
  // `children` mount in the very commit that first renders them, and React
  // flushes a child's effects before its parent's — so an effect here would
  // hand `api.ts` the token only after App's first /api/players,
  // /api/watchlist and /api/report had already gone out bare. All three 401'd
  // and the app was replaced by a splash seconds after the user signed in.
  // Assigning to a module variable is idempotent, so a re-render (or
  // StrictMode's double render) costs nothing.
  setAuthToken(session?.idToken ?? null);

  const sessionRef = useRef<StoredSession | null>(null);
  sessionRef.current = session;
  const configRef = useRef(config);
  configRef.current = config;

  const adopt = useCallback((tokens: Tokens, federated: boolean) => {
    const next: StoredSession = { ...tokens, federated };
    saveSession(next);
    setSessionState(next);
    setPhase('in');
    return next;
  }, []);

  const clear = useCallback(() => {
    saveSession(null);
    setAuthToken(null);
    setSessionState(null);
    setPhase('out');
  }, []);

  /**
   * One refresh at a time.
   *
   * App fires three requests the moment it mounts, so an expired token means
   * three simultaneous 401s and three retries. Without this they would be
   * three exchanges of the same refresh token; with it they share one.
   */
  const inFlight = useRef<Promise<string | null> | null>(null);
  const renew = useCallback((): Promise<string | null> => {
    if (inFlight.current) return inFlight.current;
    const current = sessionRef.current;
    if (!current?.refreshToken) return Promise.resolve(null);
    const federated = current.federated;
    const token = current.refreshToken;
    const p = refreshTokens(configRef.current, token)
      .then((tokens) => {
        // A refresh response carries no refresh token of its own; the one we
        // sent stays valid, so it has to be carried across.
        adopt({ ...tokens, refreshToken: tokens.refreshToken ?? token }, federated);
        return tokens.idToken;
      })
      .catch(() => null)
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = p;
    return p;
  }, [adopt]);

  // The retry handler `api.ts` calls on a 401. Registered once and left
  // registered: an effect that re-ran on every auth change used to null it in
  // its cleanup first, leaving windows where a 401 had nothing to retry with.
  const renewRef = useRef(renew);
  renewRef.current = renew;
  const reauthRef = useRef<(() => Promise<string | null>) | null>(null);
  if (!reauthRef.current) {
    reauthRef.current = async () => {
      const fresh = await renewRef.current();
      // A refresh token Cognito has stopped honouring is a session that is
      // genuinely over — the honest answer is the sign-in screen, not a retry
      // loop against a token that will never work.
      if (!fresh) clear();
      return fresh;
    };
  }
  setReauthHandler(reauthRef.current);
  useEffect(() => () => setReauthHandler(null), []);

  /**
   * Boot: the returning redirect, or a stored session, or neither.
   *
   * The stored-session branch is the one that matters most. A saved ID token
   * is only good for an hour while the refresh token beside it is good for a
   * year, so *every* return after an hour away — a closed laptop, a new tab
   * the next morning — has an expired token and a perfectly usable session.
   * Treating that as signed out is what "it makes you reauthenticate too
   * often" was; one exchange here removes it.
   */
  useEffect(() => {
    let cancelled = false;

    /**
     * Strip the redirect's own `?code=`/`?error=` before App mounts and starts
     * writing its own query string, and put back the query the user arrived
     * with.
     *
     * Called on the failure paths as well as the success one, which it was not:
     * a failed round trip used to be rewritten to a bare path, so a deep link —
     * a date range, an open player, an invite — was thrown away by the very
     * failure the user is about to retry from. (The ESPN invite no longer
     * depends on this at all; see `invite.ts`.)
     */
    const restoreQuery = () => {
      const stashed = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      window.history.replaceState(null, '', stashed || window.location.pathname);
    };

    void (async () => {
      // A redirect that came back having failed carries no `code` at all, so
      // the exchange below would call it an ordinary load and say nothing.
      const failed = oauthError();
      if (failed) {
        restoreQuery();
        if (!cancelled) {
          setBootError(failed.message);
          setPhase('out');
        }
        return;
      }
      try {
        const fromRedirect = await exchangeOnce(config);
        if (fromRedirect) {
          restoreQuery();
          if (!cancelled) adopt(fromRedirect, true);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          restoreQuery();
          setBootError(err instanceof Error ? err.message : 'Sign-in failed.');
          setPhase('out');
        }
        return;
      }

      const stored = loadSession();
      if (!stored) {
        if (!cancelled) setPhase('out');
        return;
      }
      if (isFresh(stored)) {
        if (!cancelled) {
          setSessionState(stored);
          setPhase('in');
        }
        return;
      }
      if (!stored.refreshToken) {
        saveSession(null);
        if (!cancelled) setPhase('out');
        return;
      }
      try {
        const tokens = await refreshTokens(config, stored.refreshToken);
        if (!cancelled) {
          adopt({ ...tokens, refreshToken: tokens.refreshToken ?? stored.refreshToken }, stored.federated);
        }
      } catch {
        saveSession(null);
        if (!cancelled) setPhase('out');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: `config` is fixed for the lifetime of the app, and re-running
    // would re-consume a `?code=` that has already been exchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the token ahead of its expiry while the app is open. Polling rather
  // than a timer so a machine that slept through the expiry notices on waking.
  useEffect(() => {
    if (phase !== 'in') return;
    const tick = () => {
      const current = sessionRef.current;
      if (current && !isFresh(current)) void renew();
    };
    const id = window.setInterval(tick, RENEW_POLL_MS);
    return () => window.clearInterval(id);
  }, [phase, renew]);

  /**
   * Sign out.
   *
   * For an email/password user this never leaves the page: clear the stored
   * tokens, tell Cognito to stop honouring the refresh token, and render the
   * sign-in screen. The old code did `removeUser()` and then a `signoutRedirect()`
   * — which sends OIDC's `post_logout_redirect_uri`, a parameter Cognito's
   * logout endpoint does not accept — so it landed on a Cognito error page
   * with the user's session already half torn down.
   *
   * A federated user does still take a redirect, and only they need one: it
   * clears the hosted session cookie, without which signing out and back in
   * silently re-authenticates the same Google account with no chooser. The
   * URL is Cognito's own spelling (`client_id` + `logout_uri`), and it is
   * built *before* anything is cleared so a failure can't strand the session.
   */
  const signOut = useCallback(() => {
    const current = sessionRef.current;
    const url = current?.federated ? logoutUrl(configRef.current) : null;
    // Best effort, and deliberately not awaited: local sign-out must not wait
    // on — or be prevented by — a call to Cognito.
    if (current?.refreshToken) {
      void revokeToken(configRef.current, current.refreshToken).catch(() => {});
    }
    clear();
    if (url) window.location.assign(url);
  }, [clear]);

  // Publish the session so SignOutButton — which lives inside App, and so also
  // renders when auth is off — can show it without reaching into this tree.
  useEffect(() => {
    if (!session) {
      setPublished(null);
      return;
    }
    setPublished({ email: decodeClaims(session.idToken).email ?? null, signOut });
    return () => setPublished(null);
  }, [session, signOut]);

  if (phase === 'boot') return <Splash>Signing you in</Splash>;
  if (phase === 'out') {
    return (
      <AuthScreen
        config={config}
        bootError={bootError}
        onSignedIn={(tokens) => adopt(tokens, false)}
      />
    );
  }
  return <>{children}</>;
}

/* ---- The screens -------------------------------------------------------- */

/**
 * The one wait that owns the whole window, and so the one place the baseball is
 * drawn at `lg`. There is nothing behind it to protect and nothing else on
 * screen to look at, which is the exact opposite of every other wait in the
 * app — hence a 44px ball over the product's own name rather than a mark in a
 * corner. Exported because `main.tsx` shows the same card for the step before
 * this one (reading `/config.json`), where it used to render `null` and give a
 * cold load a blank window with nothing in it at all.
 */
export function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card auth-splash">
        <h1 className="auth-title">Statcast Sicko</h1>
        <SpinningBaseball size="lg" />
        <p className="auth-sub">{children}</p>
      </div>
    </div>
  );
}

/**
 * Which screen the one card is showing.
 *
 * They are modes of a single component rather than five components, because
 * they share almost everything that matters: the email being typed, the
 * password, the in-flight flag and the error line. Splitting them would mean
 * lifting all four back out again.
 */
type Mode = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

const TITLES: Record<Mode, string> = {
  signin: 'Sign in to see your watchlist.',
  signup: 'Create an account to start a watchlist.',
  confirm: 'Check your email for a 6-digit code.',
  forgot: "We'll email you a code to reset your password.",
  reset: 'Enter the code we emailed you and a new password.',
};

/** Mirrors the pool's password policy (infra/lib/stack.ts). Shown up front on
 *  the sign-up form rather than left for Cognito to reject after the fact. */
const PASSWORD_HINT = 'At least 10 characters, with an uppercase, a lowercase and a number.';

function AuthScreen({
  config,
  bootError,
  onSignedIn,
}: {
  config: CognitoConfig;
  bootError: string | null;
  onSignedIn: (tokens: Tokens) => void;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(bootError);
  /** A confirmation that isn't a failure — "code sent to t***@g***.com". */
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Move screens by a link.
   *
   * The password is cleared here and deliberately *not* on the automatic
   * transitions (`setMode` on its own): those carry it on purpose, so that
   * confirming a sign-up code signs you straight in rather than asking for the
   * password you typed a minute ago. A link is the other case — walking from
   * sign-in to a reset shouldn't leave the password you failed to sign in with
   * sitting in a box labelled "New password".
   */
  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
    setPassword('');
  };

  /** Every submit is the same shape: clear the last message, run, and turn a
   *  thrown CognitoError into the line under the form. */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void run(async () => {
      switch (mode) {
        case 'signin':
          try {
            onSignedIn(await cognitoSignIn(config, email.trim(), password));
          } catch (err) {
            // Someone who never finished signing up shouldn't be told their
            // password is wrong — it isn't. Send them straight on with a fresh
            // code rather than making them find "resend" for themselves.
            if (err instanceof CognitoError && err.code === 'UserNotConfirmedException') {
              const to = await resendCode(config, email.trim()).catch(() => null);
              setMode('confirm');
              setNotice(`Your email isn't confirmed yet. We've sent a new code${suffix(to)}.`);
              return;
            }
            throw err;
          }
          return;
        case 'signup': {
          const res = await cognitoSignUp(config, email.trim(), password);
          if (res.confirmed) {
            onSignedIn(await cognitoSignIn(config, email.trim(), password));
            return;
          }
          setMode('confirm');
          setNotice(`Code sent${suffix(res.destination)}.`);
          return;
        }
        case 'confirm':
          await confirmSignUp(config, email.trim(), code.trim());
          // The password is still in state from the sign-up form, so the last
          // step of signing up is signing in rather than typing it all again.
          if (password) {
            onSignedIn(await cognitoSignIn(config, email.trim(), password));
            return;
          }
          setMode('signin');
          setNotice('Email confirmed — you can sign in now.');
          return;
        case 'forgot': {
          const to = await forgotPassword(config, email.trim());
          setMode('reset');
          setNotice(`Code sent${suffix(to)}.`);
          return;
        }
        case 'reset':
          await confirmForgotPassword(config, email.trim(), code.trim(), password);
          onSignedIn(await cognitoSignIn(config, email.trim(), password));
          return;
      }
    });
  };

  const google = () => {
    void run(async () => {
      // Stash the deep link the user arrived on; App's own query string is the
      // whole of its view state and the redirect would otherwise drop it.
      const q = window.location.search;
      if (q && !q.includes('code=')) sessionStorage.setItem(RETURN_KEY, q);
      window.location.assign(await googleSignInUrl(config));
    });
  };

  const showEmail = mode !== 'confirm' && mode !== 'reset';
  const showPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';
  const showCode = mode === 'confirm' || mode === 'reset';
  const action: Record<Mode, string> = {
    signin: 'Sign in',
    signup: 'Create account',
    confirm: 'Confirm email',
    forgot: 'Send code',
    reset: 'Reset password',
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Statcast Sicko</h1>
        <p className="auth-sub">{TITLES[mode]}</p>

        {/* Above the form, because a notice explains why this screen is on
            screen at all ("Code sent to t***@g***.com") — where an error is
            about the button that was just pressed and stays beside it. */}
        {notice && !error && <p className="auth-notice">{notice}</p>}

        <form className="auth-form" onSubmit={submit} noValidate>
          {showEmail ? (
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                className="auth-input"
                type="email"
                name="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
          ) : (
            // Not a field: on these two screens the address is settled, and an
            // editable box would invite changing the one thing the emailed code
            // is tied to. Kept on screen because a code with no addressee is a
            // puzzle.
            <p className="auth-addressee">
              {email} <button type="button" className="auth-link" onClick={() => go('signin')}>Change</button>
            </p>
          )}

          {showCode && (
            <label className="auth-field">
              <span className="auth-label">Confirmation code</span>
              <input
                className="auth-input auth-code"
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
              />
            </label>
          )}

          {showPassword && (
            <label className="auth-field">
              <span className="auth-label">
                {mode === 'reset' ? 'New password' : 'Password'}
              </span>
              <input
                className="auth-input"
                type="password"
                name="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              {mode !== 'signin' && <span className="auth-hint">{PASSWORD_HINT}</span>}
            </label>
          )}

          <button
            className="auth-btn auth-btn-primary"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {/* No `MIN_SPIN` floor here and none wanted: a Cognito round trip
                is hundreds of milliseconds at best, so there is no fast answer
                to leave a press without a trace — and the *result* of this
                press is the whole app replacing the card, which is the loudest
                confirmation in the product. */}
            {busy ? <LoadingLine announce={false}>Working</LoadingLine> : action[mode]}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-links">
          {mode === 'signin' && (
            <>
              <button type="button" className="auth-link" onClick={() => go('forgot')}>
                Forgot password?
              </button>
              <button type="button" className="auth-link" onClick={() => go('signup')}>
                Create an account
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button type="button" className="auth-link" onClick={() => go('signin')}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'confirm' && (
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setNotice(`New code sent${suffix(await resendCode(config, email.trim()))}.`);
                })
              }
            >
              Send a new code
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" className="auth-link" onClick={() => go('signin')}>
              Back to sign in
            </button>
          )}
        </div>

        {/* Google is offered on the two screens where someone is choosing how
            to get in. On the code screens they are mid-flow with an address
            already committed, and a second route out would only confuse it. */}
        {config.cognitoDomain && (mode === 'signin' || mode === 'signup') && (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button className="auth-btn" type="button" onClick={google} disabled={busy}>
              Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** " to t***@g***.com", or nothing when Cognito didn't say where. */
function suffix(destination: string | null): string {
  return destination ? ` to ${destination}` : '';
}

/* ---- Who's signed in, published outside React --------------------------- */

/**
 * `SignOutButton` renders inside `App`, which also mounts when auth is off —
 * and reaching for a context that isn't there would mean a null check on every
 * render plus a warning. A tiny store keeps the button honest in both worlds.
 */
interface Published {
  email: string | null;
  signOut: () => void;
}

let published: Published | null = null;
const listeners = new Set<() => void>();

function setPublished(next: Published | null): void {
  published = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function SignOutButton() {
  const current = useSyncExternalStore(
    subscribe,
    () => published,
    () => null,
  );
  if (!current) return null;
  return (
    <button
      type="button"
      className="signout-btn"
      role="menuitem"
      title={current.email ?? 'Sign out'}
      onClick={current.signOut}
    >
      Sign out{current.email ? ` (${current.email})` : ''}
    </button>
  );
}

/** Wraps the app in Cognito auth, or passes straight through when it isn't
 *  configured (local dev). */
export function AuthGate({ config, children }: { config: AuthConfig | null; children: ReactNode }) {
  if (!authConfigured(config)) return <>{children}</>;
  const c: CognitoConfig = {
    region: config!.region!,
    clientId: config!.clientId!,
    cognitoDomain: config!.cognitoDomain,
  };
  return <Gate config={c}>{children}</Gate>;
}
