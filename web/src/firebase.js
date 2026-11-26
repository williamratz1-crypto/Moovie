import { getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Firebase is optional at build time, but it used to fail in the worst possible
 * way: `getAuth(app)` was called at module scope with an empty apiKey, Firebase
 * threw during module evaluation — i.e. before React ever mounted — so
 * `ErrorBoundary` could not catch it and visitors got a blank white page.
 *
 * Now the config is validated up front. When it is incomplete we export `null`
 * for every handle plus a human-readable [firebaseConfigError]; `main.jsx`
 * renders that instead of mounting the app.
 */
const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const missingFirebaseEnv = REQUIRED_ENV.filter((name) => !import.meta.env[name]);

export const firebaseConfigError = missingFirebaseEnv.length
  ? `Firebase isn't configured for this build (missing ${missingFirebaseEnv.join(', ')}).`
  : null;

const configuredApp = firebaseConfigError
  ? null
  : (getApps().length ? getApps()[0] : initializeApp(firebaseConfig));

/**
 * Firestore with a persistent (IndexedDB) cache, so watchlist/rating writes are
 * queued while offline instead of being dropped, and repeat visits render from
 * disk before the network answers. Falls back to the in-memory cache when
 * IndexedDB is unavailable (e.g. Safari private mode).
 */
function createDb(app) {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export const auth = configuredApp ? getAuth(configuredApp) : null;
export const db = configuredApp ? createDb(configuredApp) : null;
export const googleProvider = configuredApp ? createGoogleProvider() : null;
