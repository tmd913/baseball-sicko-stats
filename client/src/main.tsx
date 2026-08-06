import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate, useAuthConfig } from './auth';
import './styles.css';

/**
 * Auth config is fetched before anything renders, so `App` never mounts (and so
 * never starts rewriting the query string) until any `?code=` from a Cognito
 * redirect has been exchanged and stripped.
 */
function Root() {
  const { config, loading } = useAuthConfig();
  if (loading) return null;
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
