import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate, Splash, useAuthConfig } from './auth';
import './styles.css';

/**
 * Auth config is fetched before anything renders, so `App` never mounts (and so
 * never starts rewriting the query string) until any `?code=` from a Cognito
 * redirect has been exchanged and stripped.
 */
function Root() {
  const { config, loading } = useAuthConfig();
  /* `null` until now, which meant a cold load showed an empty window until
     `/config.json` came back — the one wait in the app with no indicator at
     all, and the first thing anybody sees. It is the same card the gate's own
     boot splash uses, so the two steps of starting up read as one. */
  if (loading) return <Splash>Starting up</Splash>;
  return (
    <AuthGate config={config}>
      <App />
    </AuthGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
