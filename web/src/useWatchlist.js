import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { authErrorMessage } from './messages';
import {
  WATCHLIST_KEY,
  fromFirestoreItem,
  getDocId,
  normalizeWatchStatus,
  readWatchlist,
  toFirestoreItem,
} from './library';

/**
 * Single source of truth for the watchlist.
 *
 * Previously the same logic was copy-pasted into five places in `App.jsx`
 * (`toggleWatchlist`, `setWatchStatus`, `markAsWatching`,
 * `removeFromContinueWatching` and the player's progress handler), and every
 * signed-in mutation wrote to Firestore and then *returned without touching
 * local state* — so the UI only updated after the round trip, showed nothing
 * when the write failed, and did nothing whatsoever offline.
 *
 * This hook owns the state, the Firestore subscription, the guest localStorage
 * backup and the sign-in migration. Every mutation now:
 *   1. updates local state immediately (optimistic),
 *   2. writes to Firestore (queued by the persistent cache when offline),
 *   3. rolls back and reports if the write is rejected.
 *
 * Firestore remains the source of truth for signed-in users: the snapshot
 * listener reconciles the optimistic list shortly after each write.
 *
 * @param {object} options
 * @param {import('firebase/auth').User|null} options.authUser
 * @param {boolean} options.authReady
 * @param {(message: string) => void} [options.onError] receives user-facing copy
 */
export function useWatchlist({ authUser, authReady, onError }) {
  const [watchlist, setWatchlist] = useState(readWatchlist);

  /** Mirrors state so handlers can read the latest list without stale closures. */
  const watchlistRef = useRef(watchlist);

  /** uid whose local→cloud migration already ran, so it happens once per account. */
  const migratedUid = useRef('');

  /** Keeps the newest error callback without re-subscribing the listener. */
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const notify = useCallback((message) => {
    onErrorRef.current?.(message);
  }, []);

  const commit = useCallback((next) => {
    watchlistRef.current = next;
    setWatchlist(next);
  }, []);

  const signedIn = Boolean(authUser && db);

  // Guests keep a localStorage backup; signed-in state lives in Firestore only
  // (writing it locally is what leaked one account's library into the next).
  useEffect(() => {
    if (!authReady || authUser) return;
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      notify('Your browser could not save the watchlist. Check available site storage.');
    }
  }, [watchlist, authUser, authReady, notify]);

  // Subscribe to the cloud list when signed in; fall back to the guest backup.
  useEffect(() => {
    if (!authReady) return undefined;

    if (!authUser || !db) {
      commit(readWatchlist());
      return undefined;
    }

    commit([]);
    const localItems = readWatchlist();
    const watchlistCollection = collection(db, 'users', authUser.uid, 'watchlist');

    const unsubscribe = onSnapshot(
      watchlistCollection,
      async (snapshot) => {
        commit(snapshot.docs.map((item) => fromFirestoreItem(item.id, item.data())));

        // Upload titles saved while browsing as a guest, once per account.
        // Existing cloud records always win.
        if (migratedUid.current === authUser.uid) return;
        migratedUid.current = authUser.uid;
        const cloudIds = new Set(snapshot.docs.map((item) => item.id));
        const missing = localItems.filter((item) => !cloudIds.has(getDocId(item)));
        if (!missing.length) return;
        try {
          await Promise.all(missing.map((item) => setDoc(
            doc(db, 'users', authUser.uid, 'watchlist', getDocId(item)),
            toFirestoreItem(item),
          )));
        } catch (error) {
          notify(`Some saved titles could not be uploaded: ${authErrorMessage(error)}`);
        }
      },
      (error) => notify(`Watchlist sync failed: ${authErrorMessage(error)}`),
    );

    return unsubscribe;
  }, [authUser, authReady, commit, notify]);

  /**
   * Applies [next] locally, then persists it. Rolls back (and reports) if the
   * write is rejected, unless `rollback: false` — used for playback progress,
   * where reverting the bar mid-video would be worse than skipping one tick.
   */
  const runMutation = useCallback(async (next, write, { rollback = true } = {}) => {
    const previous = watchlistRef.current;
    commit(next);
    if (!signedIn) return true;
    try {
      await write();
      return true;
    } catch (error) {
      if (rollback) commit(previous);
      notify(`Could not update your cloud watchlist: ${authErrorMessage(error)}`);
      return false;
    }
  }, [commit, notify, signedIn]);

  /** Builds the next list for an upsert; changes may be a value or `(existing) => value`. */
  const buildUpsert = useCallback((movie, changesOrFn = {}) => {
    const mediaType = movie.media_type || 'movie';
    const key = getDocId({ ...movie, media_type: mediaType });
    const current = watchlistRef.current;
    const existing = current.find((item) => getDocId(item) === key);
    const changes = typeof changesOrFn === 'function' ? changesOrFn(existing) : changesOrFn;
    const nextItem = {
      ...(existing || {}),
      ...movie,
      media_type: mediaType,
      ...changes,
      updatedAt: Date.now(),
    };
    const next = existing
      ? current.map((item) => (getDocId(item) === key ? nextItem : item))
      : [nextItem, ...current];
    return { key, existing, nextItem, next };
  }, []);

  /** Adds the title if needed and applies [changes] (status, hide, progress…). */
  const save = useCallback(async (movie, changes) => {
    // Normalise legacy/duplicate status spellings ('watched' -> 'completed')
    // so local state and Firestore always agree.
    const normalized = changes && typeof changes === 'object' && 'status' in changes
      ? { ...changes, status: normalizeWatchStatus(changes.status) }
      : changes;
    const { key, nextItem, next } = buildUpsert(movie, normalized);
    return runMutation(next, () => setDoc(
      doc(db, 'users', authUser.uid, 'watchlist', key),
      toFirestoreItem(nextItem),
      { merge: true },
    ));
  }, [authUser, buildUpsert, runMutation]);

  /** Removes the title from the watchlist entirely. */
  const remove = useCallback(async (movie) => {
    const key = getDocId(movie);
    const next = watchlistRef.current.filter((item) => getDocId(item) !== key);
    return runMutation(next, () => deleteDoc(doc(db, 'users', authUser.uid, 'watchlist', key)));
  }, [authUser, runMutation]);

  /** Heart button: plan-to-watch in, or out if it is already saved. */
  const toggleSaved = useCallback(async (movie) => {
    const mediaType = movie.media_type || 'movie';
    const key = getDocId({ ...movie, media_type: mediaType });
    const existing = watchlistRef.current.find((item) => getDocId(item) === key);
    const isSaved = Boolean(existing && existing.status !== 'completed' && existing.status !== 'dropped');

    if (isSaved) return remove(movie);

    const nextItem = {
      ...(existing || {}),
      ...movie,
      media_type: mediaType,
      status: 'plan_to_watch',
      totalWatchedMinutes: Number(existing?.totalWatchedMinutes) || 0,
      updatedAt: Date.now(),
    };
    const next = [nextItem, ...watchlistRef.current.filter((item) => getDocId(item) !== key)];
    return runMutation(next, () => setDoc(
      doc(db, 'users', authUser.uid, 'watchlist', key),
      toFirestoreItem(nextItem),
      { merge: true },
    ));
  }, [authUser, remove, runMutation]);

  /**
   * Playback progress tick from the player iframe. `watchedMinutes` is the
   * delta since the last tick; it is applied server-side with `increment()` so
   * two devices watching the same title add up instead of overwriting.
   */
  const recordProgress = useCallback((movie, progress) => {
    const watchedMinutes = Number(progress.watchedMinutes) || 0;
    const { key, nextItem, next } = buildUpsert(movie, (existing) => ({
      status: 'watching',
      progressMinutes: progress.progressMinutes,
      runtimeMinutes: progress.runtimeMinutes,
      season: progress.season ?? null,
      episode: progress.episode ?? null,
      hideFromContinueWatching: false,
      totalWatchedMinutes: (Number(existing?.totalWatchedMinutes) || 0) + watchedMinutes,
    }));

    return runMutation(next, () => setDoc(
      doc(db, 'users', authUser.uid, 'watchlist', key),
      {
        status: 'watching',
        progressMinutes: progress.progressMinutes,
        runtimeMinutes: progress.runtimeMinutes,
        season: progress.season ?? null,
        episode: progress.episode ?? null,
        totalWatchedMinutes: increment(watchedMinutes),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ), { rollback: false });
  }, [authUser, buildUpsert, runMutation]);

  /** Empties local state (sign-out, "clear guest data", account deletion). */
  const clear = useCallback(() => {
    commit([]);
  }, [commit]);

  return { watchlist, save, remove, toggleSaved, recordProgress, clear };
}
