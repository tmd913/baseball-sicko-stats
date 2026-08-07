import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import type { AuthProviderProps } from 'react-oidc-context';
import { setAuthToken, setReauthHandler } from './api';

/**
 * Cognito sign-in.
 *
 * The config is fetched at boot rather than baked in at build time, so one
 * built bundle works against any deployment (and the CloudFront domain, which
 * isn't known until the stack exists, doesn't have to be a build input).
 * When `config.json` is absent or has no user pool — which is the case for
 * `npm run dev` — auth is skipped entirely and the app renders as it always has.
 */

export interface AuthConfig {
  userPoolId: string | null;
  clientId: string | null;
  cognitoDomain: string | null;
  region: string | null;
}

/** Where to send the browser back to after the hosted UI. Always the site root:
 *  the app keeps its state in the query string, which we restore separately. */
function redirectUri(): string {
  return `${window.location.origin}/`;
}

/**
 * The app's own query string, stashed across the login redirect.
 *
 * `App` reads `window.location.search` on its first render and rewrites the
 * whole query on every state change, so a deep link would otherwise be lost the
 * moment we bounce through Cognito (and the returning `?code=…` would be
 * clobbered by App's rewrite).
 */
const RETURN_KEY = 'sicko:return-query';

function stashQuery(): void {
  const q = window.location.search;
  if (q && !q.includes('code=')) sessionStorage.setItem(RETURN_KEY, q);
}

function restoreQuery(): void {
  const q = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (q) window.history.replaceState(null, '', q);
}

function settings(config: AuthConfig): AuthProviderProps {
  const domain = config.cognitoDomain!;
  return {
    authority: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
    client_id: config.clientId!,
    redirect_uri: redirectUri(),
    post_logout_redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    // Cognito's discovery document doesn't advertise the hosted-UI endpoints,
    // so point at them explicitly rather than letting oidc-client-ts try to
    // resolve an authorization_endpoint it will never find.
    metadata: {
      issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
      authorization_endpoint: `https://${domain}/oauth2/authorize`,
      token_endpoint: `https://${domain}/oauth2/token`,
      userinfo_endpoint: `https://${domain}/oauth2/userInfo`,
      end_session_endpoint: `https://${domain}/logout`,
      jwks_uri: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`,
    },
    // Strip ?code=&state= as soon as the exchange completes, before App mounts
    // and starts writing its own query string.
    onSigninCallback: () => {
      window.history.replaceState(null, '', window.location.pathname);
      restoreQuery();
    },
  };
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
  return Boolean(config?.userPoolId && config.clientId && config.cognitoDomain && config.region);
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Statcast Sicko</h1>
        {children}
      </div>
    </div>
  );
}

/** Signed-out screen. Google is offered by asking Cognito to skip straight to
 *  that provider rather than showing the hosted UI's own picker. */
function SignIn() {
  const auth = useAuth();
  const signIn = (idp?: string) => {
    stashQuery();
    void auth.signinRedirect(idp ? { extraQueryParams: { identity_provider: idp } } : undefined);
  };
  return (
    <Splash>
      <p className="auth-sub">Sign in to see your watchlist.</p>
      <button className="auth-btn auth-btn-primary" onClick={() => signIn()}>
        Sign in
      </button>
      <button className="auth-btn" onClick={() => signIn('Google')}>
        Continue with Google
      </button>
      {auth.error && <p className="auth-error">{auth.error.message}</p>}
    </Splash>
  );
}

/** Renders `children` once there's a valid token; otherwise the sign-in screen. */
function Gate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Both of these are published *during render*, not from an effect.
  //
  // `children` mount in the very commit that first renders them, and React
  // flushes a child's effects before its parent's — so an effect here would
  // hand `api.ts` the token only after App's first /api/players, /api/watchlist
  // and /api/report had already gone out bare. All three 401'd, the retry below
  // then fired `signinSilent`, and the app was replaced by the "Signing in…"
  // splash seconds after the user had in fact signed in. Assigning to a module
  // variable is idempotent, so a re-render (or StrictMode's double render)
  // costs nothing.
  setAuthToken(auth.user?.id_token ?? null);

  // The retry handler reads the live auth context out of a ref instead of
  // closing over it, so it can be registered once and stay registered. The old
  // effect re-ran on every auth change and its cleanup nulled the handler
  // first, leaving windows where a 401 had nothing to retry with.
  const authRef = useRef(auth);
  authRef.current = auth;
  const reauthRef = useRef<(() => Promise<string | null>) | null>(null);
  if (!reauthRef.current) {
    reauthRef.current = async () => {
      try {
        const user = await authRef.current.signinSilent();
        setAuthToken(user?.id_token ?? null);
        return user?.id_token ?? null;
      } catch {
        stashQuery();
        void authRef.current.signinRedirect();
        return null;
      }
    };
  }
  setReauthHandler(reauthRef.current);
  useEffect(() => () => setReauthHandler(null), []);

  // Publish the session so SignOutButton — which lives inside App, and so also
  // renders when auth is off — can show it without touching the auth context.
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setSession(null);
      return;
    }
    setSession({
      email: (auth.user?.profile.email as string | undefined) ?? null,
      signOut: () => {
        setAuthToken(null);
        void auth.removeUser().then(() => auth.signoutRedirect());
      },
    });
    return () => setSession(null);
  }, [auth, auth.isAuthenticated, auth.user]);

  // A user we've already loaded stays signed in through a background silent
  // renew. `isLoading` flips back on for every token refresh — routine, since
  // ID tokens expire mid-session — and treating that as "not signed in yet"
  // would unmount the whole app, lose its state, and put a "Signing in…" splash
  // in front of someone who signed in an hour ago. So the splash is only for a
  // boot with no user at all.
  if (!auth.user) {
    return auth.isLoading ? (
      <Splash>
        <p className="auth-sub">Signing in…</p>
      </Splash>
    ) : (
      <SignIn />
    );
  }
  // An expired token that nothing is renewing means the session is really over.
  if (!auth.isAuthenticated && !auth.isLoading) return <SignIn />;
  return <>{children}</>;
}

/**
 * Who's signed in, published outside the React context.
 *
 * `SignOutButton` renders inside `App`, which also mounts when auth is off —
 * and `useAuth()` outside an `AuthProvider` returns undefined *and* warns on
 * every render. A tiny store keeps the button honest in both worlds.
 */
interface Session {
  email: string | null;
  signOut: () => void;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

function setSession(next: Session | null): void {
  session = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function SignOutButton() {
  const current = useSyncExternalStore(
    subscribe,
    () => session,
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
  const oidc = useMemo(() => (authConfigured(config) ? settings(config!) : null), [config]);
  if (!oidc) return <>{children}</>;
  return (
    <AuthProvider {...oidc}>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
