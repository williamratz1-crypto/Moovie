import { serverTimestamp } from 'firebase/firestore';

/**
 * Shape + local-backup helpers for the user's library (watchlist and ratings).
 *
 * Extracted out of `App.jsx` so the components and the `useWatchlist` hook
 * share one definition of the document shape — and so they are unit-testable
 * without rendering React.
 */

export const WATCHLIST_KEY = 'moovie-watchlist-v1';
export const RATINGS_KEY = 'moovie-ratings-v1';

/** Maps every legacy/duplicate status spelling onto the four canonical ones. */
export function normalizeWatchStatus(status) {
  if (status === 'watched') return 'completed';
  if (status === 'want') return 'plan_to_watch';
  return ['plan_to_watch', 'watching', 'completed', 'dropped'].includes(status) ? status : 'plan_to_watch';
}

/**
 * Reads the guest watchlist backup. Tolerates corrupt/absent storage: a bad
 * JSON payload must never break app boot.
 */
export function readWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    return Array.isArray(saved)
      ? saved.map((item) => ({
        ...item,
        status: normalizeWatchStatus(item.status),
        totalWatchedMinutes: Number(item.totalWatchedMinutes) || 0,
      }))
      : [];
  } catch {
    return [];
  }
}

/** Reads the local ratings backup (same defensive behaviour as [readWatchlist]). */
export function readRatings() {
  try {
    const saved = JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

/**
 * Removes the local backups. Called on sign-out: these keys are a guest
 * fallback, and leaving them behind meant the next account to sign in on the
 * same browser inherited the previous user's watchlist and ratings (the sign-in
 * migration uploads anything local that the cloud account doesn't have).
 */
export function clearLocalLibraryBackup() {
  try {
    localStorage.removeItem(WATCHLIST_KEY);
    localStorage.removeItem(RATINGS_KEY);
  } catch {
    /* storage disabled — nothing to clear */
  }
}

/** Stable Firestore document id / React key for a title: `movie-550`. */
export function getDocId(movie) {
  return `${movie.media_type || 'movie'}-${Number(movie.id)}`;
}

/** TMDB item -> Firestore document. */
export function toFirestoreItem(movie) {
  const mediaType = movie.media_type || 'movie';
  const date = movie.release_date || movie.first_air_date || '';
  const parsedYear = Number(date.slice(0, 4));
  return {
    key: getDocId(movie),
    tmdbId: Number(movie.id),
    mediaType,
    titleName: movie.title || movie.name || 'Untitled',
    posterPath: movie.poster_path || null,
    backdropPath: movie.backdrop_path || null,
    year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : null,
    rating: Number(movie.vote_average) || 0,
    genreIds: Array.isArray(movie.genre_ids) ? movie.genre_ids.map(Number) : [],
    runtimeMinutes: movie.runtimeMinutes ?? null,
    status: normalizeWatchStatus(movie.status),
    progressMinutes: movie.progressMinutes ?? null,
    totalWatchedMinutes: Number(movie.totalWatchedMinutes) || 0,
    season: movie.season ?? null,
    episode: movie.episode ?? null,
    hideFromContinueWatching: movie.hideFromContinueWatching === true,
    addedAt: movie.addedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Firestore document -> TMDB-shaped item the UI already understands. */
export function fromFirestoreItem(id, data) {
  const mediaType = data.mediaType || 'movie';
  const year = data.year ? String(data.year) : '';
  return {
    id: Number(data.tmdbId),
    media_type: mediaType,
    title: mediaType === 'movie' ? data.titleName : undefined,
    name: mediaType === 'tv' ? data.titleName : undefined,
    poster_path: data.posterPath || null,
    backdrop_path: data.backdropPath || null,
    release_date: mediaType === 'movie' && year ? `${year}-01-01` : '',
    first_air_date: mediaType === 'tv' && year ? `${year}-01-01` : '',
    vote_average: Number(data.rating) || 0,
    genre_ids: Array.isArray(data.genreIds) ? data.genreIds : [],
    runtimeMinutes: data.runtimeMinutes ?? null,
    status: normalizeWatchStatus(data.status),
    progressMinutes: data.progressMinutes ?? null,
    totalWatchedMinutes: Number(data.totalWatchedMinutes) || 0,
    season: data.season ?? null,
    episode: data.episode ?? null,
    hideFromContinueWatching: data.hideFromContinueWatching === true,
    addedAt: data.addedAt || null,
    updatedAt: data.updatedAt || null,
    firestoreId: id,
  };
}
