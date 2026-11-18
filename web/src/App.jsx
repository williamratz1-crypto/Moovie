import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Film, Compass, Bookmark, UserRound, Play, Star, X, SlidersHorizontal, RefreshCw,
  Clapperboard, Sparkles, BookmarkCheck, LogOut, Mail, Lock,
  User, Chrome, LoaderCircle, CheckCircle2
} from 'lucide-react';
import {
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPopup, signOut,
  updateProfile
} from 'firebase/auth';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import './auth.css';
import './player.css';

const API_ROOT = 'https://api.themoviedb.org/3';
const IMAGE_ROOT = 'https://image.tmdb.org/t/p/';
const token = import.meta.env.VITE_TMDB_READ_TOKEN;
const WATCHLIST_KEY = 'moovie-watchlist-v1';
const VIDSTUCK_EMBED_ROOT = 'https://vidstuck.cc/embed';

const MOOD_FILTERS = [
  { name: 'Fun', icon: '🎉', genres: '35,12' },
  { name: 'Scary', icon: '👻', genres: '27' },
  { name: 'Hyped', icon: '⚡', genres: '28,12' },
  { name: 'Mind-Bending', icon: '🌀', genres: '878,9648,53' },
  { name: 'Romance', icon: '💘', genres: '10749' },
  { name: 'Crime Thriller', icon: '🕵️', genres: '80,53' },
  { name: 'Family Night', icon: '🍿', genres: '10751,16' },
  { name: 'Chill', icon: '🌙', genres: '18,35' },
];
const BROWSE_GENRES = [
  { id: 28, name: 'Action' }, { id: 35, name: 'Comedy' },
  { id: 27, name: 'Horror' }, { id: 878, name: 'Sci-Fi' },
  { id: 16, name: 'Animation' }, { id: 80, name: 'Crime' },
  { id: 10749, name: 'Romance' }, { id: 12, name: 'Adventure' },
  { id: 53, name: 'Thriller' }, { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasy' }, { id: 99, name: 'Documentary' },
];
const SEARCH_COUNTRIES = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'KE', name: 'Kenya' }, { code: 'IN', name: 'India' },
  { code: 'KR', name: 'South Korea' }, { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' }, { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' }, { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' }, { code: 'TR', name: 'Turkey' },
  { code: 'TH', name: 'Thailand' }, { code: 'SE', name: 'Sweden' },
];

function buildPlayerUrl(movie) {
  const mediaType = movie?.media_type === 'tv' ? 'tv' : 'movie';
  const id = Number(movie?.id);
  if (!Number.isFinite(id) || id <= 0) return '';

  const path = mediaType === 'tv'
    ? `${VIDSTUCK_EMBED_ROOT}/tv/${id}/1/1`
    : `${VIDSTUCK_EMBED_ROOT}/movie/${id}`;

  return `${path}?branding=Moovie&loading=1&back=true`;
}

async function tmdb(path) {
  if (!token || token === 'your_tmdb_read_access_token_here') {
    throw new Error('Add your TMDB Read Access Token to web/.env to load the movie catalogue.');
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`TMDB request failed (${response.status}). Check your API token.`);
  return response.json();
}

function readWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function getDocId(movie) {
  return `${movie.media_type || 'movie'}-${Number(movie.id)}`;
}

function toFirestoreItem(movie) {
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
    status: movie.status || 'want',
    progressMinutes: movie.progressMinutes ?? null,
    season: movie.season ?? null,
    episode: movie.episode ?? null,
    addedAt: movie.addedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function fromFirestoreItem(id, data) {
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
    status: data.status || 'want',
    progressMinutes: data.progressMinutes ?? null,
    season: data.season ?? null,
    episode: data.episode ?? null,
    addedAt: data.addedAt || null,
    updatedAt: data.updatedAt || null,
    firestoreId: id,
  };
}

function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use': 'An account already exists with this email. Try signing in.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password (at least 6 characters).',
    'auth/user-not-found': 'No account was found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/unauthorized-domain': 'This website domain is not authorised in Firebase Authentication.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  };
  return messages[code] || error?.message || 'Authentication failed. Please try again.';
}

function PosterCard({ movie, onSelect, showMoreDetails = false }) {
  const title = movie.title || movie.name || 'Untitled';
  return (
    <div className="poster-card-wrap">
      <button className="poster-card" onClick={() => onSelect(movie)} aria-label={`View ${title}`}>
        <div className="poster-wrap">
          {movie.poster_path
            ? <img src={IMAGE_ROOT + 'w342' + movie.poster_path} alt={title} loading="lazy" />
            : <div className="poster-fallback"><Film size={30} /><span>NO POSTER</span></div>}
          <span className="poster-rating"><Star size={12} fill="currentColor" /> {movie.vote_average ? movie.vote_average.toFixed(1) : '—'}</span>
        </div>
        <span className="poster-title">{title}</span>
        <span className="poster-year">{(movie.release_date || movie.first_air_date || '').slice(0, 4) || 'Release date TBA'}</span>
      </button>
      {showMoreDetails && (
        <button className="poster-more-details" onClick={() => onSelect(movie)}>
          More Details
        </button>
      )}
    </div>
  );
}


function PosterRow({ eyebrow, title, movies = [], onSelect, emptyMessage, onRefresh, refreshing = false }) {
  return (
    <section className="catalog-section recommendation-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="poster-row-heading-actions">
          <span className="result-count">{movies.length ? `${movies.length} PICKS` : 'PERSONALISED'}</span>
          {onRefresh && <button className="poster-row-refresh" onClick={onRefresh} disabled={refreshing} aria-label={`Refresh ${title}`}><RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} /> Refresh</button>}
        </div>
      </div>
      {movies.length ? (
        <div className="poster-row-scroll">
          {movies.map((movie) => (
            <div className="poster-row-item" key={`${movie.media_type || 'movie'}-${movie.id}`}>
              <PosterCard movie={movie} onSelect={onSelect} />
            </div>
          ))}
        </div>
      ) : (
        <div className="status-message">{emptyMessage}</div>
      )}
    </section>
  );
}

export default function App() {
  const [section, setSection] = useState('Home');
  const [movies, setMovies] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [similarSource, setSimilarSource] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchCountry, setSearchCountry] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [searchGenre, setSearchGenre] = useState('');
  const [searchSort, setSearchSort] = useState('relevance');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [detailCast, setDetailCast] = useState([]);
  const [detailVideos, setDetailVideos] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [tvRecommendations, setTvRecommendations] = useState([]);
  const [topPicks, setTopPicks] = useState([]);
  const [topPicksRefreshKey, setTopPicksRefreshKey] = useState(0);
  const [topPicksRefreshing, setTopPicksRefreshing] = useState(false);
  const [likedRecommendations, setLikedRecommendations] = useState([]);
  const [hiddenPicks, setHiddenPicks] = useState([]);
  const [recommendationSeed, setRecommendationSeed] = useState(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [watchlist, setWatchlist] = useState(readWatchlist);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerMessage, setTrailerMessage] = useState('');
  const [playerOpen, setPlayerOpen] = useState(false);
  const playerHistoryRef = useRef(false);
  const playerFrameWrapRef = useRef(null);
  const playerFrameRef = useRef(null);
  const lastProgressSaveRef = useRef({ key: '', bucket: -1 });
  const selectedDetailRequestRef = useRef('');

  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const migratedUid = useRef('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError('');
    });
    return unsubscribe;
  }, []);

  // Keep the player inside the app's browser history. The first Back closes it.
  useEffect(() => {
    function handlePopState() {
      if (playerHistoryRef.current) {
        playerHistoryRef.current = false;
        setPlayerOpen(false);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // App-level player shortcuts. Playback controls inside the cross-origin
  // Vidstuck iframe remain controlled by the provider itself.
  useEffect(() => {
    if (!playerOpen) return undefined;

    function handlePlayerKeys(event) {
      const target = event.target;
      const typing = target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (event.key === 'Escape') {
        event.preventDefault();
        closePlayer();
        return;
      }

      if (!typing && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const frame = playerFrameWrapRef.current;
        if (!document.fullscreenElement) {
          frame?.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    }

    window.addEventListener('keydown', handlePlayerKeys);
    return () => window.removeEventListener('keydown', handlePlayerKeys);
  }, [playerOpen]);

  // Receive playback progress messages sent by the Vidstuck iframe.
  useEffect(() => {
    if (!playerOpen || !selected) return undefined;

    function handleVideoProgress(event) {
      const frame = playerFrameRef.current;

      // Reject messages from any origin or frame other than the active player.
      if (event.origin !== 'https://vidstuck.cc') return;
      if (!frame || event.source !== frame.contentWindow) return;

      let message = event.data;
      if (typeof message === 'string') {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }

      if (message?.type !== 'VIDEO_PROGRESS' || !message.payload) return;

      const payload = message.payload;
      const mediaType = payload.media_type === 'tv' ? 'tv' : 'movie';

      if (
        Number(payload.tmdbId) !== Number(selected.id) ||
        mediaType !== (selected.media_type || 'movie')
      ) return;

      const currentTime = Number(payload.currentTime);
      const duration = Number(payload.duration);

      if (
        !Number.isFinite(currentTime) ||
        !Number.isFinite(duration) ||
        currentTime < 0 ||
        duration <= 0
      ) return;

      const progressMinutes = Math.round((currentTime / 60) * 10) / 10;
      const runtimeMinutes = Math.round(duration / 60);
      const season = mediaType === 'tv' ? Number(payload.season) || 1 : null;
      const episode = mediaType === 'tv' ? Number(payload.episode) || 1 : null;

      // Avoid a Firestore write every second: save once per 10 seconds watched.
      const key = `${mediaType}-${selected.id}`;
      const bucket = Math.floor(currentTime / 10);
      if (
        lastProgressSaveRef.current.key === key &&
        lastProgressSaveRef.current.bucket === bucket
      ) return;
      lastProgressSaveRef.current = { key, bucket };

      if (authUser) {
        const itemRef = doc(
          db,
          'users',
          authUser.uid,
          'watchlist',
          getDocId({ ...selected, media_type: mediaType })
        );

        setDoc(itemRef, {
          status: 'watching',
          progressMinutes,
          runtimeMinutes,
          season,
          episode,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch((writeError) => {
          setCloudError(`Playback progress could not sync: ${authErrorMessage(writeError)}`);
        });
      } else {
        setWatchlist((current) => {
          const exists = current.some((item) =>
            Number(item.id) === Number(selected.id) &&
            (item.media_type || 'movie') === mediaType
          );

          if (exists) {
            return current.map((item) =>
              Number(item.id) === Number(selected.id) &&
              (item.media_type || 'movie') === mediaType
                ? {
                    ...item,
                    status: 'watching',
                    progressMinutes,
                    runtimeMinutes,
                    season,
                    episode,
                  }
                : item
            );
          }

          return [{
            ...selected,
            media_type: mediaType,
            status: 'watching',
            progressMinutes,
            runtimeMinutes,
            season,
            episode,
          }, ...current];
        });
      }
    }

    window.addEventListener('message', handleVideoProgress);
    return () => window.removeEventListener('message', handleVideoProgress);
  }, [playerOpen, selected, authUser]);

  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      setWatchlist(readWatchlist());
      setCloudError('');
      return undefined;
    }

    setWatchlist([]);
    setCloudError('');
    const localItems = readWatchlist();
    const watchlistRef = collection(db, 'users', authUser.uid, 'watchlist');

    const unsubscribe = onSnapshot(watchlistRef, async (snapshot) => {
      const cloudItems = snapshot.docs.map((item) => fromFirestoreItem(item.id, item.data()));
      setWatchlist(cloudItems);

      // Merge local-only items once per account. Existing cloud records always win.
      if (migratedUid.current !== authUser.uid) {
        migratedUid.current = authUser.uid;
        const cloudIds = new Set(snapshot.docs.map((item) => item.id));
        const missingLocalItems = localItems.filter((item) => !cloudIds.has(getDocId(item)));
        if (missingLocalItems.length) {
          try {
            await Promise.all(missingLocalItems.map((item) =>
              setDoc(doc(db, 'users', authUser.uid, 'watchlist', getDocId(item)), toFirestoreItem(item))
            ));
          } catch (migrationError) {
            setCloudError(`Some saved titles could not be uploaded: ${authErrorMessage(migrationError)}`);
          }
        }
      }
    }, (listenerError) => {
      setCloudError(`Watchlist sync failed: ${authErrorMessage(listenerError)}`);
    });

    return unsubscribe;
  }, [authUser, authReady]);

  useEffect(() => {
    if (!authReady || authUser) return;
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      setError('Your browser could not save the watchlist. Check available site storage.');
    }
  }, [watchlist, authUser, authReady]);

  useEffect(() => {
    if (section === 'Watchlist' || section === 'Watched' || section === 'Search') {
      setLoading(false);
      setError('');
      return undefined;
    }

    let alive = true;
    setLoading(true);
    setError('');

    const similarType = similarSource?.media_type === 'tv' ? 'tv' : 'movie';
    const activeMood = MOOD_FILTERS.find((mood) => mood.name === selectedMood);
    const discoverGenres = selectedGenre ? String(selectedGenre) : activeMood?.genres;
    const endpoint = section === 'Discover'
      ? discoverGenres
        ? `/discover/movie?with_genres=${encodeURIComponent(discoverGenres)}&sort_by=popularity.desc&include_adult=false`
        : '/movie/top_rated'
      : section === 'Similar' && similarSource
        ? `/${similarType}/${similarSource.id}/similar`
        : '/trending/all/week';

    tmdb(endpoint)
      .then((data) => {
        if (!alive) return;
        const results = (data.results || [])
  .filter((item) => item.media_type !== 'person')
  .map((item) => ({
    ...item,
    media_type: section === 'Similar'
      ? similarType
      : (item.media_type === 'tv' ? 'tv' : 'movie'),
  }));
        setMovies(results);
        setHeroIndex(0);
      })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [section, similarSource?.id, similarSource?.media_type, selectedMood, selectedGenre]);
  useEffect(() => {
    if (section !== 'Discover' && section !== 'Search') return undefined;
    let alive = true;
    tmdb('/trending/tv/week')
      .then((data) => {
        if (alive) setTvRecommendations((data.results || []).map((item) => ({ ...item, media_type: 'tv' })));
      })
      .catch(() => { if (alive) setTvRecommendations([]); });
    return () => { alive = false; };
  }, [section]);

  const recommendationSignature = watchlist.map((item) =>
    `${item.media_type || 'movie'}-${item.id}-${item.status || ''}-${(item.genre_ids || []).join(',')}`
  ).join('|');

  // Build Home recommendations from the user's saved and watched titles.
  useEffect(() => {
    if (section !== 'Home') return undefined;
    let alive = true;

    const seed = watchlist.find((item) =>
      item.status === 'watched' || item.status === 'watching' ||
      Number(item.progressMinutes) > 0
    ) || watchlist[0] || null;

    setRecommendationSeed(seed);

    const hiddenPicksPath = '/discover/movie?sort_by=vote_average.desc&vote_average.gte=7&vote_count.gte=50&vote_count.lte=1200&include_adult=false&page=3';

    const requests = [
      tmdb(hiddenPicksPath),
      seed
        ? tmdb(`/${seed.media_type === 'tv' ? 'tv' : 'movie'}/${seed.id}/recommendations`)
        : Promise.resolve({ results: [] }),
    ];

    Promise.allSettled(requests).then(([hiddenResult, likedResult]) => {
      if (!alive) return;
      const watchedIds = new Set(watchlist.map((item) => `${item.media_type || 'movie'}-${item.id}`));
      const asMovies = (result, limit, fallbackType = 'movie') => result.status === 'fulfilled'
        ? (result.value.results || [])
          .map((item) => ({ ...item, media_type: item.media_type || fallbackType }))
          .filter((item) => !watchedIds.has(`${item.media_type}-${item.id}`))
          .slice(0, limit)
        : [];

      setHiddenPicks(asMovies(hiddenResult, 3, 'movie'));
      setLikedRecommendations(asMovies(likedResult, 10, seed?.media_type === 'tv' ? 'tv' : 'movie'));
    });

    return () => { alive = false; };
  }, [section, recommendationSignature]);

  // Refresh Top 10 Picks on entry, on demand, and every five minutes.
  useEffect(() => {
    if (section !== 'Home') return undefined;
    let alive = true;
    const savedGenreIds = [...new Set(
      watchlist.flatMap((item) => Array.isArray(item.genre_ids) ? item.genre_ids : [])
        .map(Number).filter((id) => Number.isFinite(id) && id > 0)
    )].slice(0, 3);
    const topPicksPage = (topPicksRefreshKey % 5) + 1;
    const topPicksPath = `/discover/movie?sort_by=popularity.desc&vote_average.gte=6.5&vote_count.gte=300&include_adult=false&page=${topPicksPage}${savedGenreIds.length ? `&with_genres=${savedGenreIds.join(',')}` : ''}`;
    setTopPicksRefreshing(true);
    tmdb(topPicksPath)
      .then((data) => {
        if (!alive) return;
        const watchedIds = new Set(watchlist.map((item) => `${item.media_type || 'movie'}-${item.id}`));
        setTopPicks((data.results || [])
          .map((item) => ({ ...item, media_type: item.media_type || 'movie' }))
          .filter((item) => !watchedIds.has(`${item.media_type}-${item.id}`))
          .slice(0, 10));
      })
      .catch(() => { if (alive) setTopPicks([]); })
      .finally(() => { if (alive) setTopPicksRefreshing(false); });

    const refreshTimer = window.setInterval(() => {
      setTopPicksRefreshKey((current) => current + 1);
    }, 5 * 60 * 1000);

    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
    };
  }, [section, recommendationSignature, topPicksRefreshKey]);

  // Automatically rotate featured titles.
useEffect(() => {
  if (section !== 'Home' || query || movies.length < 2) return;

  const timer = setInterval(() => {
    setHeroIndex((current) => (current + 1) % movies.length);
  }, 7000);

  return () => clearInterval(timer);
}, [movies, section, query]);

  const searchFiltersActive = Boolean(searchCountry || searchYear || searchGenre);

  useEffect(() => {
    if (section !== 'Search') {
      if (!query.trim()) {
        setSearchResults([]);
        return undefined;
      }
      let alive = true;
      const timer = setTimeout(() => {
        tmdb(`/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false`)
          .then((data) => { if (alive) setSearchResults((data.results || []).filter((item) => item.media_type !== 'person')); })
          .catch((err) => { if (alive) setError(err.message); });
      }, 350);
      return () => { alive = false; clearTimeout(timer); };
    }

    if (!query.trim() && !searchFiltersActive) {
      setSearchResults([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    let alive = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        let results = [];
        if (searchFiltersActive) {
          const common = [
            'include_adult=false',
            'sort_by=' + (searchSort === 'oldest' ? 'primary_release_date.asc' : searchSort === 'newest' ? 'primary_release_date.desc' : 'popularity.desc'),
            searchCountry ? `with_origin_country=${encodeURIComponent(searchCountry)}` : '',
            searchGenre ? `with_genres=${encodeURIComponent(searchGenre)}` : '',
          ].filter(Boolean).join('&');
          const movieParams = [common, searchYear ? `primary_release_year=${searchYear}` : ''].filter(Boolean).join('&');
          const tvParams = [
            'include_adult=false',
            `sort_by=${searchSort === 'oldest' ? 'first_air_date.asc' : searchSort === 'newest' ? 'first_air_date.desc' : 'popularity.desc'}`,
            searchCountry ? `with_origin_country=${encodeURIComponent(searchCountry)}` : '',
            searchGenre ? `with_genres=${encodeURIComponent(searchGenre)}` : '',
            searchYear ? `first_air_date_year=${searchYear}` : '',
          ].filter(Boolean).join('&');
          const [movieData, tvData] = await Promise.all([
            tmdb(`/discover/movie?${movieParams}`),
            tmdb(`/discover/tv?${tvParams}`),
          ]);
          results = [
            ...(movieData.results || []).map((item) => ({ ...item, media_type: 'movie' })),
            ...(tvData.results || []).map((item) => ({ ...item, media_type: 'tv' })),
          ];
          if (query.trim()) {
            const needle = query.trim().toLowerCase();
            results = results.filter((item) => `${item.title || item.name || ''} ${item.overview || ''}`.toLowerCase().includes(needle));
          }
        } else {
          const data = await tmdb(`/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false`);
          results = (data.results || []).filter((item) => item.media_type !== 'person');
        }

        if (alive) setSearchResults(results);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    }, query.trim() ? 350 : 80);

    return () => { alive = false; clearTimeout(timer); };
  }, [section, query, searchCountry, searchYear, searchGenre, searchSort]);

  const visibleMovies = useMemo(() => {
    if (section === 'Search') {
      let results = [...searchResults];
      if (searchYear && !searchFiltersActive) {
        results = results.filter((item) => (item.release_date || item.first_air_date || '').startsWith(searchYear));
      }
      if (searchGenre && !searchFiltersActive) {
        results = results.filter((item) => (item.genre_ids || []).map(Number).includes(Number(searchGenre)));
      }
      if (searchCountry && !searchFiltersActive) {
        results = results.filter((item) => (item.origin_country || []).includes(searchCountry));
      }
      if (searchSort === 'newest' || searchSort === 'oldest') {
        results.sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          return searchSort === 'newest' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        });
      }
      return results;
    }
    if (!query.trim() && section === 'Watchlist') {
      return watchlist.filter((item) => item.status !== 'watched');
    }
    if (!query.trim() && section === 'Watched') {
      return watchlist.filter((item) => item.status === 'watched');
    }
    return query.trim() ? searchResults : movies;
  }, [section, query, searchResults, movies, watchlist, searchCountry, searchYear, searchGenre, searchSort, searchFiltersActive]);

  const selectedWatchlistItem = selected && watchlist.find((item) =>
    Number(item.id) === Number(selected.id) &&
    (item.media_type || 'movie') === (selected.media_type || 'movie')
  );
  const isSaved = Boolean(selectedWatchlistItem && selectedWatchlistItem.status !== 'watched');
  const isWatched = Boolean(selectedWatchlistItem?.status === 'watched');

  async function toggleWatchlist(movie) {
    const type = movie.media_type || 'movie';
    const existing = watchlist.find((item) =>
      Number(item.id) === Number(movie.id) &&
      (item.media_type || 'movie') === type
    );
    const isActiveWatchlistItem = Boolean(existing && existing.status !== 'watched');
    const watchlistItem = {
      ...(existing || {}),
      ...movie,
      media_type: type,
      status: 'want',
    };

    if (authUser) {
      const itemRef = doc(db, 'users', authUser.uid, 'watchlist', getDocId({ ...movie, media_type: type }));
      try {
        if (isActiveWatchlistItem) {
          await deleteDoc(itemRef);
        } else {
          await setDoc(itemRef, toFirestoreItem(watchlistItem), { merge: true });
        }
        setCloudError('');
      } catch (writeError) {
        setCloudError(`Could not update your cloud watchlist: ${authErrorMessage(writeError)}`);
      }
      return;
    }

    setWatchlist((current) => {
      if (isActiveWatchlistItem) {
        return current.filter((item) =>
          !(Number(item.id) === Number(movie.id) &&
            (item.media_type || 'movie') === type)
        );
      }
      const alreadyExists = current.some((item) =>
        Number(item.id) === Number(movie.id) &&
        (item.media_type || 'movie') === type
      );
      return alreadyExists
        ? current.map((item) =>
            Number(item.id) === Number(movie.id) &&
            (item.media_type || 'movie') === type
              ? watchlistItem
              : item
          )
        : [watchlistItem, ...current];
    });
  }

  async function toggleWatched(movie) {
    if (!movie) return;
    const mediaType = movie.media_type || 'movie';
    const existing = watchlist.find((item) =>
      Number(item.id) === Number(movie.id) &&
      (item.media_type || 'movie') === mediaType
    );
    const nextStatus = existing?.status === 'watched' ? 'want' : 'watched';
    const updatedItem = {
      ...(existing || {}),
      ...movie,
      media_type: mediaType,
      status: nextStatus,
      ...(nextStatus === 'want'
        ? { progressMinutes: 0, season: null, episode: null }
        : {}),
    };

    if (authUser) {
      const itemRef = doc(
        db,
        'users',
        authUser.uid,
        'watchlist',
        getDocId({ ...movie, media_type: mediaType })
      );
      try {
        await setDoc(itemRef, toFirestoreItem(updatedItem), { merge: true });
        setCloudError('');
      } catch (writeError) {
        setCloudError(`Could not update your watched list: ${authErrorMessage(writeError)}`);
      }
      return;
    }

    setWatchlist((current) => {
      const found = current.some((item) =>
        Number(item.id) === Number(movie.id) &&
        (item.media_type || 'movie') === mediaType
      );
      if (found) {
        return current.map((item) =>
          Number(item.id) === Number(movie.id) &&
          (item.media_type || 'movie') === mediaType
            ? updatedItem
            : item
        );
      }
      return [updatedItem, ...current];
    });
  }

  async function openDetails(movie) {
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const id = Number(movie.id);
    const requestKey = `${mediaType}-${id}`;
    selectedDetailRequestRef.current = requestKey;

    setSelected({ ...movie, media_type: mediaType });
    setPlayerOpen(false);
    setTrailerOpen(false);
    setDetailTab('overview');
    setDetailCast([]);
    setDetailVideos([]);
    setDetailLoading(true);
    setTrailerUrl('');
    setTrailerMessage('');

    const isCurrentRequest = () => selectedDetailRequestRef.current === requestKey;

    const [detailsResult, creditsResult, videosResult] = await Promise.allSettled([
      tmdb(`/${mediaType}/${id}`),
      tmdb(`/${mediaType}/${id}/credits`),
      tmdb(`/${mediaType}/${id}/videos`),
    ]);

    if (!isCurrentRequest()) return;

    if (detailsResult.status === 'fulfilled') {
      setSelected((current) => current && Number(current.id) === id
        ? { ...current, ...detailsResult.value, media_type: mediaType }
        : current);
    }

    if (creditsResult.status === 'fulfilled') {
      setDetailCast((creditsResult.value.cast || []).slice(0, 18));
    }

    if (videosResult.status === 'fulfilled') {
      setDetailVideos(videosResult.value.results || []);
      const videos = videosResult.value.results || [];
      const trailer = videos.find((video) => video.site === 'YouTube' && video.type === 'Trailer' && video.official)
        || videos.find((video) => video.site === 'YouTube' && video.type === 'Trailer')
        || videos.find((video) => video.site === 'YouTube' && video.type === 'Teaser');
      if (trailer?.key) setTrailerUrl(`https://www.youtube.com/watch?v=${trailer.key}`);
    }

    setDetailLoading(false);
  }

  async function markAsWatching(movie) {
    if (!movie) return;
    const mediaType = movie.media_type || 'movie';
    const existing = watchlist.find((item) =>
      Number(item.id) === Number(movie.id) && (item.media_type || 'movie') === mediaType
    );

    if (authUser) {
      const itemRef = doc(db, 'users', authUser.uid, 'watchlist', getDocId({ ...movie, media_type: mediaType }));
      try {
        if (existing) {
          await setDoc(itemRef, {
            status: 'watching',
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } else {
          await setDoc(itemRef, toFirestoreItem({
            ...movie,
            media_type: mediaType,
            status: 'watching',
            progressMinutes: 0,
          }));
        }
        setCloudError('');
      } catch (writeError) {
        setCloudError(`Could not update your cloud watchlist: ${authErrorMessage(writeError)}`);
      }
      return;
    }

    setWatchlist((current) => {
      const found = current.some((item) =>
        Number(item.id) === Number(movie.id) && (item.media_type || 'movie') === mediaType
      );
      if (found) {
        return current.map((item) =>
          Number(item.id) === Number(movie.id) && (item.media_type || 'movie') === mediaType
            ? { ...item, status: 'watching' }
            : item
        );
      }
      return [{
        ...movie,
        media_type: mediaType,
        status: 'watching',
        progressMinutes: 0,
      }, ...current];
    });
  }

  async function openPlayer(movieToPlay = selected) {
    if (playerOpen || !movieToPlay) return;

    const playableMovie = {
      ...movieToPlay,
      media_type: movieToPlay.media_type || 'movie',
    };
    if (!buildPlayerUrl(playableMovie)) return;

    setSelected(playableMovie);

    // Ensure the watchlist entry exists before progress updates arrive.
    await markAsWatching(playableMovie);
    lastProgressSaveRef.current = { key: '', bucket: -1 };

    window.history.pushState({ mooviePlayer: true }, '', window.location.href);
    playerHistoryRef.current = true;
    setPlayerOpen(true);
  }

  function closePlayer() {
    setPlayerOpen(false);
    if (playerHistoryRef.current) {
      playerHistoryRef.current = false;
      window.history.back();
    }
  }

  async function findTrailer() {
    if (!selected) return;
    setTrailerLoading(true);
    setTrailerMessage('');
    setTrailerUrl('');
    setTrailerOpen(true);
    try {
      const cachedVideos = detailVideos;
      let videos = cachedVideos;
      if (!videos.length) {
        const type = selected.media_type || 'movie';
        const data = await tmdb(`/${type}/${selected.id}/videos`);
        videos = data.results || [];
        setDetailVideos(videos);
      }
      const trailer = videos.find((video) => video.site === 'YouTube' && video.type === 'Trailer' && video.official)
        || videos.find((video) => video.site === 'YouTube' && video.type === 'Trailer')
        || videos.find((video) => video.site === 'YouTube' && video.type === 'Teaser');
      if (trailer?.key) setTrailerUrl(`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`);
      else setTrailerMessage('No trailer is available for this title yet.');
    } catch (err) {
      setTrailerMessage(err.message || 'Could not find a trailer right now.');
    } finally {
      setTrailerLoading(false);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        if (authName.trim()) await updateProfile(credential.user, { displayName: authName.trim() });
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setAuthOpen(false);
      setAuthPassword('');
      setAuthName('');
    } catch (authFailure) {
      setAuthError(authErrorMessage(authFailure));
    } finally {
      setAuthBusy(false);
    }
  }

  async function googleSignIn() {
    setAuthBusy(true);
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthOpen(false);
    } catch (authFailure) {
      setAuthError(authErrorMessage(authFailure));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setAuthOpen(false);
    } catch (signOutError) {
      setAuthError(authErrorMessage(signOutError));
    }
  }

  const accountName = authUser?.displayName || authUser?.email?.split('@')[0] || 'Movie lover';
  const accountInitial = accountName.charAt(0).toUpperCase() || 'M';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setSection('Home'); setQuery(''); }}>
          <span className="brand-mark"><Clapperboard size={21} /></span><span>moovie<span className="brand-dot">.</span></span>
        </a>
        <div className="side-label">MENU</div>
        <nav className="side-nav">
          <button className={section === 'Home' ? 'active' : ''} onClick={() => { setSection('Home'); setQuery(''); }}><Film /> Home</button>
          <button className={section === 'Discover' ? 'active' : ''} onClick={() => { setSection('Discover'); setQuery(''); }}><Compass /> Discover</button>
          <button className={section === 'Search' ? 'active' : ''} onClick={() => { setSection('Search'); setQuery(''); setError(''); }}><Search /> Search</button>
          <button className={section === 'Watchlist' ? 'active' : ''} onClick={() => { setSection('Watchlist'); setQuery(''); setError(''); }}><Bookmark /> Watchlist <span className="watchlist-count">{watchlist.filter((item) => item.status !== 'watched').length}</span></button>
          <button className={section === 'Watched' ? 'active' : ''} onClick={() => { setSection('Watched'); setQuery(''); setError(''); }}><CheckCircle2 /> Watched <span className="watchlist-count">{watchlist.filter((item) => item.status === 'watched').length}</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="profile-chip profile-chip-button" onClick={() => setAuthOpen(true)}>
            <div className="avatar">{authUser ? accountInitial : 'M'}</div>
            <div><strong>{authUser ? accountName : 'Movie lover'}</strong><span>{authUser ? 'Signed in' : 'Guest account'}</span></div>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><Clapperboard size={20} /> moovie<span>.</span></div>
          <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies, series..." /><kbd>⌘ K</kbd></div>
          <button className="profile-button" aria-label="Open account" onClick={() => setAuthOpen(true)}><UserRound size={19} /></button>
        </header>

{!query && section === 'Home' && movies[heroIndex] && (() => {
  const featured = movies[heroIndex]
  const featuredType = featured.media_type || 'movie';
  const featuredTitle = featured.title || featured.name || 'Featured title';
  const featuredSaved = watchlist.some((item) =>
    Number(item.id) === Number(featured.id) &&
    (item.media_type || 'movie') === featuredType &&
    item.status !== 'watched'
  );
  const releaseDate = featured.release_date || featured.first_air_date || '';

  return (
    <section className="hero-banner" aria-label="Featured trending titles">
      {featured.backdrop_path && (
        <img
          key={featured.backdrop_path}
          className="hero-backdrop"
          src={IMAGE_ROOT + 'w1280' + featured.backdrop_path}
          alt=""
        />
      )}

      <div className="hero-shade" />
      <div className="hero-copy" key={`${featuredType}-${featured.id}`}>
        <span className="hero-tag">FEATURED THIS WEEK</span>
        <h2>{featuredTitle}</h2>
        <div className="hero-meta">
          {releaseDate && <span>{releaseDate.slice(0, 4)}</span>}
          {releaseDate && <span className="hero-meta-dot">•</span>}
          <span><Star size={13} fill="currentColor" /> {featured.vote_average ? featured.vote_average.toFixed(1) : 'Not rated'}</span>
          <span className="hero-meta-type">{featuredType === 'tv' ? 'SERIES' : 'MOVIE'}</span>
        </div>
        <p>{featured.overview || 'Discover your next favourite story.'}</p>

        <div className="hero-actions">
          <button className="hero-button" onClick={() => openPlayer({ ...featured, media_type: featuredType })}>
            <Play size={14} fill="currentColor" /> Watch now
          </button>

          <button
            className={`hero-secondary ${featuredSaved ? 'is-saved' : ''}`}
            onClick={() => toggleWatchlist(featured)}
          >
            {featuredSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {featuredSaved ? 'In Watchlist' : 'Add to Watchlist'}
          </button>

          <button
            className="hero-secondary hero-explore"
            onClick={() => {
              setSimilarSource({ ...featured, media_type: featuredType });
              setQuery('');
              setSection('Similar');
            }}
          >
            Explore More Like This
          </button>
        </div>
      </div>

      {movies.length > 1 && (
        <div className="hero-controls">
          <button
            className="hero-arrow"
            aria-label="Previous featured title"
            onClick={() => setHeroIndex((current) => (current - 1 + movies.length) % movies.length)}
          >
            ‹
          </button>
          <div className="hero-dots" aria-label="Choose featured title">
            {movies.map((movie, index) => (
              <button
                key={`${movie.media_type || 'movie'}-${movie.id}`}
                className={`hero-dot ${index === heroIndex ? 'active' : ''}`}
                aria-label={`Show featured title ${index + 1}`}
                aria-current={index === heroIndex ? 'true' : undefined}
                onClick={() => setHeroIndex(index)}
              />
            ))}
          </div>
          <button
            className="hero-arrow"
            aria-label="Next featured title"
            onClick={() => setHeroIndex((current) => (current + 1) % movies.length)}
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
})()}


        {section === 'Home' && !query && watchlist.some((item) =>
          item.status !== 'watched' &&
          (item.media_type === 'tv' || item.status === 'watching' || Number(item.progressMinutes) > 0)
        ) && <section className="continue-section">
          <div className="section-heading">
            <div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching</h2></div>
            <span className="result-count">{watchlist.filter((item) => item.status !== 'watched' && (item.media_type === 'tv' || item.status === 'watching' || Number(item.progressMinutes) > 0)).length} TITLES</span>
          </div>
          <div className="continue-grid">
            {watchlist.filter((item) => item.status !== 'watched' && (item.media_type === 'tv' || item.status === 'watching' || Number(item.progressMinutes) > 0))
              .map((item) => {
                const runtime = Number(item.runtimeMinutes) || 0;
                const progress = Number(item.progressMinutes) || 0;
                const percent = runtime > 0 ? Math.min(100, Math.max(0, (progress / runtime) * 100)) : 0;
                const title = item.title || item.name || 'Untitled';
                return <button className="continue-card" key={`${item.media_type || 'movie'}-${item.id}`} onClick={() => openDetails(item)}>
                  <div className="continue-poster">
                    {item.poster_path
                      ? <img src={IMAGE_ROOT + 'w342' + item.poster_path} alt="" loading="lazy" />
                      : <div className="poster-fallback"><Film size={25} /></div>}
                    <span className="continue-play"><Play size={17} fill="currentColor" /></span>
                  </div>
                  <div className="continue-info">
                    <strong>{title}</strong>
                    <span>{item.media_type === 'tv'
                      ? `SEASON ${item.season || 1} · EPISODE ${item.episode || 1}`
                      : runtime > 0 && progress > 0 ? `${progress} OF ${runtime} MIN` : 'IN PROGRESS'}</span>
                    <div className="continue-progress"><i style={{ width: `${percent}%` }} /></div>
                  </div>
                </button>;
              })}
          </div>
        </section>}

        {section === 'Home' && !query && <>
          <PosterRow
            eyebrow="CURATED FOR YOU"
            title="Top 10 Picks for You"
            movies={topPicks}
            onSelect={openDetails}
            onRefresh={() => setTopPicksRefreshKey((current) => current + 1)}
            refreshing={topPicksRefreshing}
            emptyMessage="Your picks are being prepared. Browse or save a few titles to help Moovie learn your taste."
          />
          <PosterRow
            eyebrow={recommendationSeed ? 'BASED ON YOUR TASTE' : 'YOUR NEXT FAVOURITE'}
            title={recommendationSeed
              ? `Because You Liked ${recommendationSeed.title || recommendationSeed.name || 'That Title'}`
              : 'Because You Liked…'}
            movies={likedRecommendations}
            onSelect={openDetails}
            emptyMessage="Add a title to your Watchlist or mark something as watched to unlock recommendations based on your taste."
          />
          <PosterRow
            eyebrow="OFF THE RADAR"
            title="Hidden Picks"
            movies={hiddenPicks}
            onSelect={openDetails}
            emptyMessage="Hidden Picks are temporarily unavailable. Try again in a moment."
          />
        </>}

        {section === 'Discover' && !query && <section className="discovery-hub">
          <div className="discovery-block">
            <div className="section-heading"><div><span className="eyebrow">PICK YOUR VIBE</span><h2>What are you in the mood for?</h2></div></div>
            <div className="mood-grid">
              {MOOD_FILTERS.map((mood) => <button key={mood.name} className={`mood-chip ${selectedMood === mood.name ? 'active' : ''}`} onClick={() => { setSelectedMood(selectedMood === mood.name ? '' : mood.name); setSelectedGenre(null); }}>
                <span>{mood.icon}</span>{mood.name}
              </button>)}
            </div>
          </div>
          <div className="discovery-block">
            <div className="section-heading"><div><span className="eyebrow">FIND YOUR NEXT WATCH</span><h2>Browse by genre</h2></div></div>
            <div className="genre-grid">
              {BROWSE_GENRES.map((genre) => <button key={genre.id} className={`genre-chip ${selectedGenre === genre.id ? 'active' : ''}`} onClick={() => { setSelectedGenre(selectedGenre === genre.id ? null : genre.id); setSelectedMood(''); }}>{genre.name}<span>↗</span></button>)}
            </div>
          </div>
        </section>}

        {section === 'Search' ? <section className="search-discovery-page">
          <div className="search-discovery-heading">
            <span className="eyebrow">YOUR NEXT WATCH STARTS HERE</span>
            <h1>What's on your mind?</h1>
            <p>Find a film, discover a new series, or narrow things down to your taste.</p>
          </div>
          <div className="search-discovery-input"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, shows, stories..." autoComplete="off" /><button type="button" onClick={() => setQuery('')} aria-label="Clear search" disabled={!query}><X size={17} /></button></div>
          <div className="search-filter-panel">
            <div className="search-filter-title"><SlidersHorizontal size={16} /><span>Refine your search</span></div>
            <div className="search-filter-grid">
              <label><span>COUNTRY</span><select value={searchCountry} onChange={(event) => setSearchCountry(event.target.value)}><option value="">All countries</option>{SEARCH_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
              <label><span>RELEASE YEAR</span><select value={searchYear} onChange={(event) => setSearchYear(event.target.value)}><option value="">Any year</option>{Array.from({ length: new Date().getFullYear() - 1949 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <label><span>GENRE</span><select value={searchGenre} onChange={(event) => setSearchGenre(event.target.value)}><option value="">All genres</option>{BROWSE_GENRES.map((genre) => <option key={genre.id} value={genre.id}>{genre.name}</option>)}</select></label>
              <label><span>SORT BY</span><select value={searchSort} onChange={(event) => setSearchSort(event.target.value)}><option value="relevance">Relevance</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            </div>
            {(searchCountry || searchYear || searchGenre || searchSort !== 'relevance' || query) && <button className="search-clear-filters" onClick={() => { setQuery(''); setSearchCountry(''); setSearchYear(''); setSearchGenre(''); setSearchSort('relevance'); }}>Clear search and filters</button>}
          </div>
          {query.trim() || searchFiltersActive ? <section className="catalog-section search-results-section">
            <div className="section-heading"><div><span className="eyebrow">{query.trim() ? 'MATCHING TITLES' : 'FILTERED DISCOVERY'}</span><h2>{query.trim() ? `Results for “${query}”` : 'Explore your filters'}</h2></div><span className="result-count">{visibleMovies.length} TITLES</span></div>
            {loading && <div className="status-message">Finding titles for you…</div>}
            {!loading && error && <div className="status-message error"><strong>Search unavailable</strong><span>{error}</span></div>}
            {!loading && !error && visibleMovies.length === 0 && <div className="status-message">No titles match those filters. Try changing a filter or broadening your search.</div>}
            <div className="movie-grid">{visibleMovies.map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} showMoreDetails />)}</div>
          </section> : <>
            <div className="search-recommendation-intro"><span className="eyebrow">PICKED AROUND YOUR TASTE</span><h2>Recommended for you</h2><p>Based on your watchlist and the titles you've explored.</p></div>
            <div className="movie-grid search-recommendation-grid">{[...likedRecommendations, ...topPicks, ...tvRecommendations].filter((item, index, all) => all.findIndex((other) => `${other.media_type || 'movie'}-${other.id}` === `${item.media_type || 'movie'}-${item.id}`) === index).slice(0, 18).map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} />)}</div>
            {![...likedRecommendations, ...topPicks, ...tvRecommendations].length && <div className="status-message">Moovie is preparing recommendations. Save or watch a few titles to personalise this space.</div>}
          </>}
        </section> : <>
        <section className="catalog-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {query ? 'MATCHING TITLES'
                  : section === 'Discover' ? 'CRITIC FAVOURITES'
                    : section === 'Watchlist' ? 'YOUR COLLECTION'
                      : section === 'Watched' ? 'YOUR WATCH HISTORY'
                        : section === 'Similar' ? 'MORE TO EXPLORE'
                          : 'UPDATED WEEKLY'}
              </span>
              <h2>
                {query ? `Results for “${query}”`
                  : section === 'Discover' ? 'Top rated'
                    : section === 'Watchlist' ? 'Watchlist'
                      : section === 'Watched' ? 'Watched'
                        : section === 'Similar' ? `Similar to ${similarSource?.title || similarSource?.name || 'this title'}`
                          : 'Trending this week'}
              </h2>
            </div>
            <div className="catalog-heading-actions">
              <span className="result-count">{visibleMovies.length} TITLES</span>
              {section === 'Similar' && (
                <button className="back-home-button" onClick={() => setSection('Home')}>
                  Back to Home
                </button>
              )}
            </div>
          </div>
          {loading && <div className="status-message">Loading the catalogue…</div>}
          {!loading && error && <div className="status-message error"><strong>Catalogue unavailable</strong><span>{error}</span>{!token && <span>Copy <code>.env.example</code> to <code>.env</code> and add your TMDB Read Access Token, then restart the dev server.</span>}</div>}
          {cloudError && <div className="status-message error"><strong>Cloud sync notice</strong><span>{cloudError}</span></div>}
          {!authReady && <div className="status-message">Checking account…</div>}
          {!loading && !error && visibleMovies.length === 0 && <div className="status-message">{section === 'Watchlist' && !query ? 'Your watchlist is empty. Open a title and choose “Add to watchlist” to save it here.' : section === 'Watched' && !query ? 'No watched titles yet. Open a title and mark it as watched when you finish it.' : section === 'Similar' ? 'No similar titles were found for this selection.' : 'No titles found. Try another search.'}</div>}
          <div className="movie-grid">{visibleMovies.map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} showMoreDetails={Boolean(query.trim())} />)}</div>
        </section>
        {section === 'Discover' && !query && tvRecommendations.length > 0 && <section className="catalog-section recommendation-section">
          <div className="section-heading"><div><span className="eyebrow">SERIES WORTH YOUR TIME</span><h2>Trending TV shows</h2></div><span className="result-count">UPDATED WEEKLY</span></div>
          <div className="movie-grid">{tvRecommendations.slice(0, 12).map((show) => <PosterCard key={`tv-${show.id}`} movie={show} onSelect={openDetails} />)}</div>
        </section>}
        </>}
        <footer className="footer-note">MOOVIE WEB <span>•</span> BUILT FOR THE LOVE OF FILM</footer>
      </main>

      {selected && <div className="detail-page-backdrop">
        <section className="detail-page" aria-label={`${selected.title || selected.name} details`}>
          <div className="detail-page-top">
            <button className="detail-back-button" onClick={() => setSelected(null)}>
              <span aria-hidden="true">←</span> Back to browsing
            </button>
            <button className="detail-page-close" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button>
          </div>

          <div className="detail-page-hero">
            {selected.backdrop_path && <img src={IMAGE_ROOT + 'w1280' + selected.backdrop_path} alt="" />}
            <div className="detail-page-hero-shade" />
            <div className="detail-page-heading">
              <span className="eyebrow">{selected.media_type === 'tv' ? 'SERIES DETAILS' : 'MOVIE DETAILS'}</span>
              <h1>{selected.title || selected.name}</h1>
              <p className="detail-meta">
                {(selected.release_date || selected.first_air_date || '').slice(0, 4) || 'Release date TBA'}
                <span>•</span>
                <Star size={13} fill="currentColor" /> {selected.vote_average?.toFixed(1) || 'Not rated'}
                {selected.runtime ? <><span>•</span>{selected.runtime} min</> : null}
              </p>
              <div className="detail-actions">
                <button className="detail-play-button" onClick={() => openPlayer(selected)} disabled={!buildPlayerUrl(selected) || playerOpen}>
                  <Play size={16} fill="currentColor" /> Watch Now
                </button>
                <button className={`detail-watch-button ${isSaved ? 'saved' : ''}`} onClick={() => toggleWatchlist(selected)}>
                  {isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                  {isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
                </button>
                <button className={`detail-watch-button ${isWatched ? 'saved' : ''}`} onClick={() => toggleWatched(selected)}>
                  <CheckCircle2 size={17} /> {isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                </button>
                <button className="detail-watch-button" onClick={findTrailer} disabled={trailerLoading}>
                  <Play size={16} fill="currentColor" /> {trailerLoading ? 'Finding Trailer…' : 'Find Trailer'}
                </button>
              </div>
            </div>
          </div>

          <div className="detail-page-body">
            <nav className="detail-tabs" aria-label="Title information">
              <button className={detailTab === 'overview' ? 'active' : ''} onClick={() => setDetailTab('overview')}>Overview</button>
              <button className={detailTab === 'cast' ? 'active' : ''} onClick={() => setDetailTab('cast')}>Cast</button>
              <button className={detailTab === 'trailers' ? 'active' : ''} onClick={() => setDetailTab('trailers')}>Trailers</button>
            </nav>

            {detailLoading && <p className="detail-loading">Loading title information…</p>}

            {detailTab === 'overview' && (
              <div className="detail-overview-panel">
                <div>
                  <span className="eyebrow">THE STORY</span>
                  <p className="detail-overview">{selected.overview || 'No overview is available for this title yet.'}</p>
                </div>
                <div className="detail-facts">
                  {selected.genres?.length > 0 && <div><span>GENRES</span><strong>{selected.genres.map((genre) => genre.name).join(' · ')}</strong></div>}
                  {selected.status && <div><span>STATUS</span><strong>{selected.status}</strong></div>}
                  {selected.number_of_seasons && <div><span>SEASONS</span><strong>{selected.number_of_seasons}</strong></div>}
                </div>
              </div>
            )}

            {detailTab === 'cast' && (
              <div className="detail-cast-panel">
                {detailCast.length ? detailCast.map((person) => (
                  <article className="detail-cast-card" key={person.credit_id || person.id}>
                    {person.profile_path
                      ? <img src={IMAGE_ROOT + 'w185' + person.profile_path} alt={person.name} loading="lazy" />
                      : <div className="detail-cast-placeholder"><UserRound size={25} /></div>}
                    <strong>{person.name}</strong>
                    <span>{person.character || 'Cast'}</span>
                  </article>
                )) : !detailLoading && <p className="detail-empty">Cast information is not available for this title.</p>}
              </div>
            )}

            {detailTab === 'trailers' && (
              <div className="detail-trailers-panel">
                {detailVideos.filter((video) => video.site === 'YouTube' && ['Trailer', 'Teaser'].includes(video.type)).length
                  ? detailVideos.filter((video) => video.site === 'YouTube' && ['Trailer', 'Teaser'].includes(video.type)).map((video) => (
                    <a className="detail-trailer-card" key={video.key} href={`https://www.youtube.com/watch?v=${video.key}`} target="_blank" rel="noreferrer">
                      <span className="detail-trailer-play"><Play size={20} fill="currentColor" /></span>
                      <span><strong>{video.name}</strong><small>{video.type}{video.official ? ' · OFFICIAL' : ''}</small></span>
                    </a>
                  ))
                  : !detailLoading && <p className="detail-empty">No trailers or teasers are available for this title yet.</p>}
              </div>
            )}
          </div>
        </section>
      </div>}

      {trailerOpen && <div className="trailer-backdrop" role="dialog" aria-modal="true" aria-label="Trailer preview" onClick={() => setTrailerOpen(false)}>
        <section className="trailer-window" onClick={(event) => event.stopPropagation()}>
          <header className="trailer-window-header"><div><span className="eyebrow">MOOVIE PREVIEW</span><strong>{selected?.title || selected?.name || 'Trailer'}</strong></div><button onClick={() => setTrailerOpen(false)} aria-label="Close trailer"><X size={20} /></button></header>
          {trailerUrl ? <div className="trailer-video-wrap"><iframe src={trailerUrl} title={`${selected?.title || selected?.name || 'Title'} trailer`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div> : <div className="trailer-empty">{trailerLoading ? 'Finding the best available trailer…' : trailerMessage || 'No trailer is available.'}</div>}
        </section>
      </div>}

      {playerOpen && selected && <div className="player-backdrop" role="dialog" aria-modal="true" aria-label={`Playing ${selected.title || selected.name}`} onClick={closePlayer}>
        <section className="player-window" onClick={(event) => event.stopPropagation()}>
          <header className="player-header">
            <div className="player-heading">
              <span className="player-brand-mark"><Clapperboard size={18} /></span>
              <div>
                <strong>{selected.title || selected.name}</strong>
                <span>{selected.media_type === 'tv' ? 'TV SERIES · SEASON 1 · EPISODE 1' : 'NOW PLAYING ON MOOVIE'}</span>
              </div>
            </div>
            <button className="player-close" onClick={closePlayer} aria-label="Close player"><X size={20} /></button>
          </header>
          <div className="player-frame-wrap" ref={playerFrameWrapRef}>
            <iframe
              ref={playerFrameRef}
              key={buildPlayerUrl(selected)}
              className="player-frame"
              src={buildPlayerUrl(selected)}
              title={`Moovie player: ${selected.title || selected.name}`}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="player-footer">
            <span>MOOVIE PLAYER</span>
            <span>ESC · CLOSE &nbsp;&nbsp; F · FULLSCREEN</span>
          </div>
        </section>
      </div>}

      {authOpen && <div className="modal-backdrop auth-backdrop" onClick={() => { setAuthOpen(false); setAuthError(''); }}>
        <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => { setAuthOpen(false); setAuthError(''); }} aria-label="Close"><X /></button>
          {authUser ? (
            <div className="auth-account">
              <div className="auth-icon"><UserRound size={25} /></div>
              <span className="eyebrow">YOUR MOOVIE ACCOUNT</span>
              <h2>{accountName}</h2>
              <p>{authUser.email}</p>
              <div className="auth-sync-note"><BookmarkCheck size={16} /> Your watchlist is connected to the cloud.</div>
              <button className="auth-submit auth-signout" onClick={handleSignOut}><LogOut size={16} /> Sign out</button>
              {authError && <p className="auth-error">{authError}</p>}
            </div>
          ) : (
            <>
              <div className="auth-icon"><Clapperboard size={25} /></div>
              <span className="eyebrow">YOUR STORIES, SAVED</span>
              <h2>{authMode === 'register' ? 'Create your account.' : 'Welcome back.'}</h2>
              <p className="auth-subtitle">{authMode === 'register' ? 'Create an account to keep your watchlist in sync.' : 'Sign in to access your synced Moovie watchlist.'}</p>
              <button className="auth-google" onClick={googleSignIn} disabled={authBusy}><Chrome size={17} /> Continue with Google</button>
              <div className="auth-divider"><span>OR CONTINUE WITH EMAIL</span></div>
              <form className="auth-form" onSubmit={submitAuth}>
                {authMode === 'register' && <label><span>Name</span><div className="auth-input-wrap"><User size={16} /><input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" autoComplete="name" /></div></label>}
                <label><span>Email</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label>
                <label><span>Password</span><div className="auth-input-wrap"><Lock size={16} /><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={6} required /></div></label>
                {authError && <p className="auth-error">{authError}</p>}
                <button className="auth-submit" type="submit" disabled={authBusy}>
                  {authBusy ? <LoaderCircle size={17} className="auth-spinner" /> : null}
                  {authBusy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}
                </button>
              </form>
              <p className="auth-switch">{authMode === 'register' ? 'Already have an account?' : "Don't have an account?"} <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthError(''); }}>{authMode === 'register' ? 'Sign in' : 'Create one'}</button></p>
            </>
          )}
        </section>
      </div>}
    </div>
  );
}
