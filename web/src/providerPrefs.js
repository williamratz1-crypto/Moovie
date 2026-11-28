import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { authErrorMessage } from './messages';

/**
 * Per-title player preference ("which server did I use for this film?").
 *
 * Keyed by `${mediaType}-${tmdbId}` — the same id shape as the watchlist
 * documents — so `movie-550` and `tv-550` are independent, and so are two
 * different shows.
 *
 * Guests keep the map in localStorage; signed-in users get one document per
 * title at `users/{uid}/providerPrefs/{mediaType-tmdbId}`, matching the
 * existing `users/{uid}/...` architecture. Nothing is written to localStorage
 * while signed in, so one account's choices can't leak into the next.
 *
 * An unknown or missing value normalises to `null`, which is what makes the
 * app show the first-time chooser again rather than guessing.
 */

export const PROVIDER_STORAGE_KEY = 'moovie-provider-prefs-v1';
export const PLAYER_IDS = ['vidstuck', 'vidfast'];

/** Returns a known provider id, or null for anything else (including ''). */
export function normalizeProvider(value) {
  return PLAYER_IDS.includes(value) ? value : null;
}

/** `${mediaType}-${id}`, or '' when the title can't be keyed. */
export function providerPrefKey(movie) {
  const mediaType = movie?.media_type === 'tv' ? 'tv' : 'movie';
  const id = Number(movie?.id);
  if (!Number.isFinite(id) || id <= 0) return '';
  return `${mediaType}-${Math.floor(id)}`;
}

export function readGuestPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROVIDER_STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean = {};
    Object.entries(raw).forEach(([key, value]) => {
      const provider = normalizeProvider(value);
      if (provider && key) clean[key] = provider;
    });
    return clean;
  } catch {
    return {};
  }
}

export function writeGuestPrefs(prefs) {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} options
 * @param {import('firebase/auth').User|null} options.authUser
 * @param {boolean} options.authReady
 * @param {(message: string) => void} [options.onError]
 */
export function useProviderPreferences({ authUser, authReady, onError }) {
  const [prefs, setPrefs] = useState({});
  const prefsRef = useRef({});
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Resolves once the current preference set has been read. openPlayer awaits
  // it so a click during the Firestore read doesn't show a spurious chooser.
  const loadPromiseRef = useRef(Promise.resolve());
  const waitForLoaded = useCallback(() => loadPromiseRef.current, []);

  const commit = useCallback((next) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  const signedIn = Boolean(authUser && db);

  useEffect(() => {
    if (!authReady) return undefined;

    if (!signedIn) {
      const guest = readGuestPrefs();
      commit(guest);
      loadPromiseRef.current = Promise.resolve();
      return undefined;
    }

    let cancelled = false;
    let resolveLoad;
    loadPromiseRef.current = new Promise((resolve) => { resolveLoad = resolve; });
    commit({});

    getDocs(collection(db, 'users', authUser.uid, 'providerPrefs'))
      .then((snapshot) => {
        if (cancelled) return;
        const loaded = {};
        snapshot.docs.forEach((item) => {
          const provider = normalizeProvider(item.data()?.provider);
          if (provider) loaded[item.id] = provider;
        });
        commit(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        onErrorRef.current?.(`Player preferences could not be loaded: ${authErrorMessage(error)}`);
      })
      .finally(() => {
        resolveLoad?.();
      });

    return () => {
      cancelled = true;
      resolveLoad?.();
    };
  }, [authUser, authReady, signedIn, commit]);

  /** The saved provider for this title, or null when the user must choose. */
  const getProvider = useCallback((movie) => {
    const key = providerPrefKey(movie);
    if (!key) return null;
    return normalizeProvider(prefsRef.current[key]);
  }, []);

  /** Saves the choice for this title only (optimistically, then to the store). */
  const setProvider = useCallback(async (movie, provider) => {
    const key = providerPrefKey(movie);
    const next = normalizeProvider(provider);
    if (!key || !next) return false;

    const updated = { ...prefsRef.current, [key]: next };
    commit(updated);

    if (!signedIn) {
      writeGuestPrefs(updated);
      return true;
    }

    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'providerPrefs', key),
        {
          provider: next,
          tmdbId: Math.floor(Number(movie.id)),
          mediaType: movie?.media_type === 'tv' ? 'tv' : 'movie',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    } catch (error) {
      onErrorRef.current?.(`Could not save the player for this title: ${authErrorMessage(error)}`);
      return false;
    }
  }, [authUser, commit, signedIn]);

  return { prefs, getProvider, setProvider, waitForLoaded };
}
