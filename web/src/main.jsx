import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { firebaseConfigError, missingFirebaseEnv } from './firebase.js';
import { installGlobalKeyboard } from './globalKeyboard.js';
import './styles.css';

/**
 * Shown instead of the app when the Firebase build-time config is missing.
 * Without this the failure mode was a blank white page (Firebase threw while
 * `firebase.js` was being imported, before React could mount).
 */
function ConfigNotice() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        background: '#111014',
        color: '#f4f2ec',
        textAlign: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <span style={{ fontSize: '13px', letterSpacing: '0.18em', opacity: 0.6 }}>MOOVIE WEB</span>
      <h1 style={{ fontSize: '22px', margin: 0 }}>Firebase isn&apos;t configured.</h1>
      <p style={{ maxWidth: '460px', margin: 0, opacity: 0.75, fontSize: '14px', lineHeight: 1.5 }}>
        This build is missing its Firebase environment variables, so accounts and cloud
        sync are unavailable. Add them to <code>web/.env</code> (see <code>web/.env.example</code>)
        and rebuild.
      </p>
      <p
        style={{
          maxWidth: '460px',
          margin: '6px 0 0',
          fontSize: '12px',
          opacity: 0.65,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          wordBreak: 'break-word',
        }}
      >
        Missing: {missingFirebaseEnv.join(', ')}
      </p>
      {firebaseConfigError && (
        <p style={{ maxWidth: '460px', margin: 0, fontSize: '12px', opacity: 0.45 }}>{firebaseConfigError}</p>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>{firebaseConfigError ? <ConfigNotice /> : <App />}</ErrorBoundary>
  </React.StrictMode>
);

installGlobalKeyboard();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Resolve against the app base (e.g. "/app/") rather than the current URL:
    // a deep link served through 404.html sits at /app/title/movie-550, where
    // a relative "./sw.js" would request /app/title/sw.js and 404.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Moovie service worker registration failed:', error);
    });
  });
}
