import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Film, Compass, Bookmark, UserRound, Play, Star, X, SlidersHorizontal, RefreshCw,
  Clapperboard, Sparkles, BookmarkCheck, LogOut, Mail, Lock,
  User, Chrome, LoaderCircle, CheckCircle2, PanelLeftClose, PanelLeftOpen,
  Clock3, Heart, Trash2, Settings, Palette
} from 'lucide-react';
import {
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPopup, signOut,
  updateProfile, deleteUser, EmailAuthProvider,
  reauthenticateWithCredential, reauthenticateWithPopup
} from 'firebase/auth';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
  getDocs, where, query as firestoreQuery
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { authErrorMessage } from './messages';
import { RATINGS_KEY, clearLocalLibraryBackup, getDocId, readRatings } from './library';
import { useWatchlist } from './useWatchlist';
import { useProviderPreferences } from './providerPrefs';
import { ProviderSwitch } from './ProviderSwitch';
import { useReveal } from './useReveal';
import './auth.css';
import './player.css';

const API_ROOT = 'https://api.themoviedb.org/3';
const IMAGE_ROOT = 'https://image.tmdb.org/t/p/';
const token = import.meta.env.VITE_TMDB_READ_TOKEN;
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
const THEME_PRESETS = [
  { id: 'solar-gold', name: 'Solar Gold', tag: 'DEFAULT', accent: '#f5c518', desc: 'Moovie signature radiant gold.' },
  { id: 'cyber-purple', name: 'Cyber Purple', tag: 'NEON', accent: '#b57bff', desc: 'Deep synthwave violet glow.' },
  { id: 'crimson-red', name: 'Crimson Red', tag: 'VIBRANT', accent: '#ff4d5e', desc: 'Bold electric action red.' },
  { id: 'electric-cyan', name: 'Electric Cyan', tag: 'COOL', accent: '#3fd9ff', desc: 'Futuristic sci-fi neon teal.' },
  { id: 'emerald-green', name: 'Emerald Green', tag: 'FRESH', accent: '#39d98a', desc: 'Crisp high-energy emerald.' },
  { id: 'sakura-pink', name: 'Sakura Pink', tag: 'PASTEL', accent: '#ff8fb8', desc: 'Soft romantic cherry blossom.' },
  { id: 'sunset-amber', name: 'Sunset Amber', tag: 'WARM', accent: '#ff9e4d', desc: 'Warm twilight amber glow.' },
  { id: 'royal-violet', name: 'Royal Violet', tag: 'DEEP', accent: '#8a7bff', desc: 'Regal atmospheric lavender.' },
  { id: 'sky-blue', name: 'Sky Blue', tag: 'CLEAR', accent: '#5ab8ff', desc: 'Clean open-sky digital blue.' },
  { id: 'yume-sage', name: 'Sage Green', tag: 'CALM', accent: '#9fc97f', desc: 'Original calm sage aesthetic.' },
];
const GENRE_NAMES = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',53:'Thriller',10752:'War',37:'Western'};
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

const VIDFAST_PLAYER_ROOT = 'https://vidfast.vc';

// Playback sources. Vidstuck is listed first and is the default everywhere
// buildPlayerUrl() is called without an explicit provider.
const PLAYER_PROVIDERS = [
  { id: 'vidstuck', label: 'Vidstuck' },
  { id: 'vidfast', label: 'VidFast' },
];

const clampEpisodeNumber = (value) => Math.max(1, Math.floor(Number(value) || 1));

// How long a Watch Now click waits for the stored provider preference.
const PLAYER_PREFS_WAIT_MS = 1200;

/**
 * Resolves once `readPrefs()` settles or `timeoutMs` elapses — whichever is
 * first — and never rejects. A rejected read resolves too: the preference map
 * stays empty, which is exactly what shows the first-time chooser, and the
 * hook has already reported the error.
 *
 * The read itself is only observed, never cancelled: if it loses the race it
 * keeps running and updates the stored map in the background.
 */
function waitForPrefsWithTimeout(readPrefs, timeoutMs = PLAYER_PREFS_WAIT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const settle = () => { clearTimeout(timer); resolve(); };
    try {
      readPrefs().then(settle, settle);
    } catch {
      settle();
    }
  });
}

function buildVidstuckUrl(movie) {
  const mediaType = movie?.media_type === 'tv' ? 'tv' : 'movie';
  const id = Number(movie?.id);
  if (!Number.isFinite(id) || id <= 0) return '';

  const season = clampEpisodeNumber(movie?.season);
  const episode = clampEpisodeNumber(movie?.episode);
  const path = mediaType === 'tv'
    ? `${VIDSTUCK_EMBED_ROOT}/tv/${id}/${season}/${episode}`
    : `${VIDSTUCK_EMBED_ROOT}/movie/${id}`;

  const params = new URLSearchParams({ branding: 'Moovie', loading: '1', back: 'true' });
  return `${path}?${params.toString()}`;
}

/**
 * https://vidfast.vc/movie/{id}
 * https://vidfast.vc/tv/{id}/{season}/{episode}
 *
 * Every segment is a validated integer appended to a fixed origin, so a bad
 * id can only ever produce '' (callers fall back to the default player) — it
 * cannot inject a path or a different host.
 */
function buildVidFastUrl(movie) {
  const mediaType = movie?.media_type === 'tv' ? 'tv' : 'movie';
  const id = Number(movie?.id);
  if (!Number.isFinite(id) || id <= 0) return '';
  const numericId = Math.floor(id);

  if (mediaType === 'tv') {
    const season = clampEpisodeNumber(movie?.season);
    const episode = clampEpisodeNumber(movie?.episode);
    return `${VIDFAST_PLAYER_ROOT}/tv/${numericId}/${season}/${episode}`;
  }
  return `${VIDFAST_PLAYER_ROOT}/movie/${numericId}`;
}

const PLAYER_URL_BUILDERS = { vidstuck: buildVidstuckUrl, vidfast: buildVidFastUrl };

// The only origins allowed to drive playback state. Anything else is ignored
// even if it reaches the window.
const PLAYER_ORIGINS = {
  'https://vidstuck.cc': 'vidstuck',
  'https://vidfast.vc': 'vidfast',
};

/**
 * Normalises a message from either player into one shape, or returns null.
 *
 * Vidstuck:  { type: 'VIDEO_PROGRESS', payload: { media_type, tmdbId, currentTime, duration, season, episode } }
 * VidFast:   { type: 'PLAYER_EVENT', data: { event, currentTime, duration, tmdbId, mediaType, season, episode, playing } }
 *
 * The two dialects are deliberately kept separate: VidFast does not speak
 * VIDEO_PROGRESS and its payload is not read as one.
 */
function readPlaybackEvent(message, activeTitle) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (!activeTitle) return null;

  let mediaType;
  let tmdbId;
  let currentTime;
  let duration;
  let season;
  let episode;
  let eventName = '';

  if (message.type === 'VIDEO_PROGRESS') {
    const payload = message.payload;
    if (!payload || typeof payload !== 'object') return null;
    mediaType = payload.media_type === 'tv' ? 'tv' : 'movie';
    tmdbId = payload.tmdbId;
    currentTime = payload.currentTime;
    duration = payload.duration;
    season = payload.season;
    episode = payload.episode;
  } else if (message.type === 'PLAYER_EVENT') {
    const data = message.data;
    if (!data || typeof data !== 'object') return null;
    mediaType = data.mediaType === 'tv' ? 'tv' : 'movie';
    tmdbId = data.tmdbId;
    currentTime = data.currentTime;
    duration = data.duration;
    season = data.season;
    episode = data.episode;
    eventName = typeof data.event === 'string' ? data.event.toLowerCase() : '';
  } else {
    return null;
  }

  // The message must be about the title that is actually open, as the same
  // type — a stale frame or a mismatched id must never write progress.
  const activeType = activeTitle.media_type === 'tv' ? 'tv' : 'movie';
  if (Number(tmdbId) !== Number(activeTitle.id)) return null;
  if (mediaType !== activeType) return null;

  const position = Number(currentTime);
  const total = Number(duration);
  if (!Number.isFinite(position) || !Number.isFinite(total)) return null;
  if (position < 0 || total <= 0) return null;
  if (position > total * 1.05) return null; // nonsense position, ignore it

  const seasonNumber = mediaType === 'tv' ? Math.max(1, Math.floor(Number(season) || 1)) : null;
  const episodeNumber = mediaType === 'tv' ? Math.max(1, Math.floor(Number(episode) || 1)) : null;

  return {
    mediaType,
    position,
    total,
    season: seasonNumber,
    episode: episodeNumber,
    eventName,
    paused: eventName === 'pause',
    ended: eventName === 'ended' || eventName === 'complete' || eventName === 'completed',
  };
}

function buildPlayerUrl(movie, provider = 'vidstuck') {
  const build = PLAYER_URL_BUILDERS[provider] || PLAYER_URL_BUILDERS.vidstuck;
  return build(movie);
}

async function tmdb(path, signal) {
  if (!token || token === 'your_tmdb_read_access_token_here') {
    throw new Error('Add your TMDB Read Access Token to web/.env to load the movie catalogue.');
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`TMDB request failed (${response.status}). Check your API token.`);
  return response.json();
}

function getFeaturedStatus(movie,today=new Date()) { const type=movie?.media_type==='tv'?'tv':'movie',raw=type==='tv'?movie?.first_air_date:movie?.release_date; if(!raw)return type==='tv'?'AIRING':'RELEASED'; const date=new Date(raw+'T00:00:00'); if(!Number.isFinite(date.getTime()))return type==='tv'?'AIRING':'RELEASED'; const days=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-date)/86400000); if(type==='tv')return Math.abs(days)<=7?'NEW EPISODES':'AIRING'; return days<0?'COMING SOON':days<=60?'NOW SHOWING':'RELEASED'; }
const ROUTE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const SECTION_ROUTES = { Home: '', Discover: 'discover', Search: 'search', Watchlist: 'watchlist', Watched: 'watched', Profile: 'profile', Settings: 'settings', Similar: 'similar' };
const SECTION_BY_ROUTE = Object.fromEntries(Object.entries(SECTION_ROUTES).map(([name, route]) => [route || '/', name]));
function routeHref(route) { return `${ROUTE_BASE}/${route}`.replace(/\/+$/, '') || `${ROUTE_BASE}/`; }
function parseTitleRoute(pathname) {
  const base = `${ROUTE_BASE}/`;
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const match = path.match(/^title\/(movie|tv)-(\d+)\/?$/);
  return match ? { media_type: match[1], id: Number(match[2]) } : null;
}
function sectionFromPath(pathname) {
  const base = `${ROUTE_BASE}/`;
  const path = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '')).replace(/\/+$/, '') || '/';
  return SECTION_BY_ROUTE[path] || 'Home';
}

function PosterCard({movie,onSelect,showMoreDetails=false}){const title=movie.title||movie.name||'Untitled',[loaded,setLoaded]=useState(false),type=movie.media_type==='tv'?'SERIES':'MOVIE',year=(movie.release_date||movie.first_air_date||'').slice(0,4)||'YEAR TBA';return <div className="poster-card-wrap"><button className="poster-card" onClick={()=>onSelect(movie)} aria-label={`View ${title}`}><div className="poster-wrap">{movie.poster_path?<img className={`poster-image${loaded?' is-loaded':''}`} src={IMAGE_ROOT+'w342'+movie.poster_path} alt={title} loading="lazy" onLoad={()=>setLoaded(true)} onError={()=>setLoaded(true)}/>:<div className="poster-fallback"><Film size={30}/><span>NO POSTER</span></div>}<span className="poster-rating"><Star size={12} fill="currentColor"/> {movie.vote_average?movie.vote_average.toFixed(1):'—'}</span></div><span className="poster-title">{title}</span><span className="poster-year">{type} · {year}</span></button>{showMoreDetails&&<button className="poster-more-details" onClick={()=>onSelect(movie)}>More Details</button>}</div>}
function RankedList({title,eyebrow,movies,onSelect,type}){return <section className="ranked-column"><div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="result-count">TOP 5</span></div>{movies.slice(0,5).map((movie,index)=>{const name=movie.title||movie.name||'Untitled';return <button className="ranked-item" key={`${movie.media_type||type}-${movie.id}`} onClick={()=>onSelect(movie)} aria-label={`Rank ${index+1}: View ${name}`}><span className={`rank-badge rank-${index+1}`} aria-hidden="true">{index+1}</span><span className="ranked-thumb">{movie.poster_path?<img src={IMAGE_ROOT+'w92'+movie.poster_path} alt="" loading="lazy"/>:<Film size={17}/>}</span><span className="ranked-copy"><strong>{name}</strong><small><Star size={11} fill="currentColor"/> {movie.vote_average?movie.vote_average.toFixed(1):'—'} · {type}</small><small className="ranked-year">{(movie.release_date||movie.first_air_date||'').slice(0,4)||'—'}</small></span></button>})}{!movies.length&&<div className="status-message">Ranked titles are temporarily unavailable.</div>}</section>}
function PosterSkeletons({ count = 12 }) {
  return <div className="movie-grid poster-skeleton-grid" aria-label="Loading titles" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div className="poster-skeleton-card" key={index}>
      <div className="poster-skeleton-art" />
      <div className="poster-skeleton-line" />
      <div className="poster-skeleton-line short" />
    </div>)}
  </div>;
}

function PosterRow({ eyebrow, title, movies = [], onSelect, emptyMessage, onRefresh, refreshing = false, statusMessage = '' }) {
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
        <div className="status-message">{statusMessage || emptyMessage}</div>
      )}
      {movies.length > 0 && statusMessage && <p className="status-message">{statusMessage}</p>}
    </section>
  );
}

function ProfileDashboard({ authUser, accountName, stats, recentlyWatched, topRatedTitles, onOpenTitle, onSignOut, onDeleteAccount, onClearGuestData, onSignIn, authError, authBusy, profileAvatar, profileNameDraft, onProfileNameChange, onSaveProfileName, profileSaveBusy, onChooseAvatar }) {
 return <section className="profile-page">
  <div className="profile-page-heading"><span className="eyebrow">YOUR MOOVIE SPACE</span><h1>Your profile.</h1><p>Your viewing history, taste profile and collection at a glance.</p></div>
  <div className="profile-identity-card"><div className="profile-large-avatar">{profileAvatar || (accountName||'M').charAt(0).toUpperCase()}</div><div className="profile-identity-copy"><strong>{accountName}</strong><span>{authUser?.email||'Guest account · saved locally on this device'}</span><small>{authUser?'CLOUD-SYNCED ACCOUNT':'LOCAL GUEST PROFILE'}</small></div><div className="profile-avatar-picker" aria-label="Choose profile avatar">{['🎬','🍿','🎥','🌟','🦋','🐈','👾','🖤'].map((avatar)=><button type="button" key={avatar} className={profileAvatar===avatar?'active':''} onClick={()=>onChooseAvatar(avatar)} aria-label={'Choose '+avatar}>{avatar}</button>)}</div>{authUser&&<span className="profile-sync-indicator">SYNCED</span>}</div>
  <div className="profile-stat-grid">
   <article className="profile-stat-card"><Clock3/><span>TRACKED WATCH TIME</span><strong>{stats.watchHours} hrs</strong><small>Time tracked during playback</small></article>
   <article className="profile-stat-card"><Film/><span>MOVIES COMPLETED</span><strong>{stats.moviesCompleted}</strong><small>Marked as completed</small></article>
   <article className="profile-stat-card"><Clapperboard/><span>SERIES COMPLETED</span><strong>{stats.seriesCompleted}</strong><small>Marked as completed</small></article>
   <article className="profile-stat-card"><Star/><span>YOUR RATINGS</span><strong>{stats.ratingCount}</strong><small>Six-star ratings submitted</small></article>
  </div>
  <div className="profile-section-grid">
   <section className="profile-panel"><div className="section-heading"><div><span className="eyebrow">YOUR TASTE</span><h2>Favourite genre</h2></div><Heart size={18}/></div><strong className="profile-favourite-genre">{stats.favoriteGenre||'Not enough history yet'}</strong><p>Based on genres attached to titles in your collection.</p></section>
   <section className="profile-panel"><div className="section-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2>Watchlist breakdown</h2></div><Bookmark size={18}/></div><div className="profile-breakdown">
    {[[ 'Watching', stats.watching ], [ 'Plan to Watch', stats.planToWatch ], [ 'Completed', stats.completed ], [ 'Dropped', stats.dropped ]].map(([label, count]) => <div className="profile-breakdown-item" key={label}><div className="profile-breakdown-row"><span>{label}</span><strong>{count}</strong></div><div className="profile-breakdown-track"><i style={{ width: (stats.collectionCount ? count / stats.collectionCount * 100 : 0) + '%' }} /></div></div>)}
   </div></section>
  </div>
  <section className="profile-content-section"><div className="section-heading"><div><span className="eyebrow">YOUR LATEST ACTIVITY</span><h2>Recently watched</h2></div><span className="result-count">{recentlyWatched.length} TITLES</span></div>{recentlyWatched.length?<div className="movie-grid profile-movie-grid">{recentlyWatched.map(movie=><PosterCard key={getDocId(movie)} movie={movie} onSelect={onOpenTitle}/>)}</div>:<div className="status-message">Your recently watched titles will appear here as you play or complete something.</div>}</section>
  <section className="profile-content-section"><div className="section-heading"><div><span className="eyebrow">YOUR HIGHEST RATINGS</span><h2>Titles you loved</h2></div><span className="result-count">{stats.ratingCount} RATED</span></div>{topRatedTitles.length?<div className="movie-grid profile-movie-grid">{topRatedTitles.map(movie=><div className="profile-rated-item" key={getDocId(movie)}><PosterCard movie={movie} onSelect={onOpenTitle}/><span><Star size={12} fill="currentColor"/> {stats.ratings[getDocId(movie)]}/6</span></div>)}</div>:<div className="status-message">Rate titles out of six stars to build your favourites shelf.</div>}</section>
  <section className="profile-account-panel"><div className="profile-settings-heading"><span className="eyebrow">ACCOUNT & DATA</span><h2>Account settings</h2><p>{authUser?'Manage your Moovie account and stored viewing data.':'Guest data stays in this browser until you clear it or sign in.'}</p><label className="profile-name-field"><span>DISPLAY NAME</span><input value={profileNameDraft} onChange={(event)=>onProfileNameChange(event.target.value)} maxLength={32} placeholder="Your name"/></label><button className="profile-save-name" onClick={onSaveProfileName} disabled={profileSaveBusy}>{profileSaveBusy?'Saving…':'Save display name'}</button></div><div className="profile-account-actions">{authUser?<><button className="detail-watch-button" onClick={onSignOut}><LogOut size={15}/> Sign out</button><button className="profile-delete-button" onClick={onDeleteAccount} disabled={authBusy}><Trash2 size={15}/> Delete account & data</button></>:<><button className="detail-play-button" onClick={onSignIn}><UserRound size={15}/> Sign in / Create account</button><button className="profile-delete-button" onClick={onClearGuestData}><Trash2 size={15}/> Clear guest data</button></>}</div>{authError&&<p className="auth-error profile-account-error">{authError}</p>}</section>
 </section>;
}

function SettingsPage({ authUser, accountName, profileAvatar, profileNameDraft, onProfileNameChange, onSaveProfileName, profileSaveBusy, onChooseAvatar, onSignOut, onSignIn, onDeleteAccount, onClearGuestData, authError, authBusy, themeId, setThemeId }) {
  const [settingsTab, setSettingsTab] = useState('profile');
  const settingsTabs = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];
  const activeTheme = THEME_PRESETS.find((theme) => theme.id === themeId) || THEME_PRESETS[0];
  return <section className="settings-page">
    <header className="settings-page-heading">
      <span className="eyebrow">MOOVIE SETTINGS</span>
      <h1>Settings</h1>
      <p>Manage your account and appearance.</p>
    </header>
    <div className="settings-layout">
      <nav className="settings-nav-card" aria-label="Settings sections">
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          return <button type="button" key={tab.id} className={settingsTab === tab.id ? 'active' : ''} onClick={() => setSettingsTab(tab.id)}>
            <Icon size={17}/><span>{tab.label}</span>
          </button>;
        })}
      </nav>
      <div className="settings-panel-column">
        {settingsTab === 'profile' ? <section className="settings-panel settings-account-panel">
          <div className="settings-panel-heading"><span className="eyebrow">ACCOUNT</span><h2>Profile</h2><p>Manage your Moovie identity and account access.</p></div>
          <div className="settings-account-identity">
            <div className="profile-large-avatar">{profileAvatar || (accountName || 'M').charAt(0).toUpperCase()}</div>
            <div className="profile-identity-copy"><strong>{accountName}</strong><span>{authUser?.email || 'Guest account'}</span><small>{authUser ? 'CLOUD-SYNCED ACCOUNT' : 'LOCAL GUEST PROFILE'}</small></div>
          </div>
          <div className="settings-avatar-picker" aria-label="Choose profile avatar">
            {['🎬','🍿','🎥','🌟','🦋','🐈','👾','🖤'].map((avatar) => <button type="button" key={avatar} className={profileAvatar === avatar ? 'active' : ''} onClick={() => onChooseAvatar(avatar)} aria-label={'Choose ' + avatar}>{avatar}</button>)}
          </div>
          <label className="settings-name-field"><span>DISPLAY NAME</span><input value={profileNameDraft} onChange={(event) => onProfileNameChange(event.target.value)} maxLength={32} placeholder="Your name"/></label>
          <button type="button" className="settings-save-name" onClick={onSaveProfileName} disabled={profileSaveBusy}>{profileSaveBusy ? 'Saving…' : 'Save display name'}</button>
          <div className="settings-account-actions">
            {authUser ? <>
              <button type="button" className="detail-watch-button" onClick={onSignOut} disabled={authBusy}><LogOut size={15}/> Sign out</button>
              <button type="button" className="profile-delete-button" onClick={onDeleteAccount} disabled={authBusy}><Trash2 size={15}/> Delete account &amp; data</button>
            </> : <>
              <button type="button" className="detail-play-button" onClick={onSignIn}><UserRound size={15}/> Sign in / Create account</button>
              <button type="button" className="profile-delete-button" onClick={onClearGuestData} disabled={authBusy}><Trash2 size={15}/> Clear guest data</button>
            </>}
          </div>
          {authError && <p className="auth-error profile-account-error">{authError}</p>}
        </section> : <section className="settings-panel settings-appearance-panel">
          <div className="settings-theme-heading"><div><span className="eyebrow">THEME &amp; ACCENT COLORS</span><h2>Appearance</h2><p>Choose the accent color across your Moovie experience.</p></div><button type="button" className="settings-reset-theme" onClick={() => setThemeId('solar-gold')} disabled={themeId === 'solar-gold'}>Reset</button></div>
          <div className="settings-live-preview">
            <div className="settings-preview-topline"><span className="eyebrow">LIVE PREVIEW</span><span className="settings-preview-theme">{activeTheme.name}</span></div>
            <div className="settings-preview-actions"><button type="button" className="settings-preview-watch"><Play size={14} fill="currentColor"/> Watch Now</button><div className="settings-preview-badges"><span>★ 8.8 MATCH</span><b>HD</b></div></div>
            <div className="settings-preview-progress"><div><span>Progress · 14:20 / 24:00</span><strong>60%</strong></div><i><span/></i></div>
            <small>{activeTheme.name} · Accent preview updates instantly</small>
          </div>
          <div className="settings-palette-heading"><span className="eyebrow">SELECT THEME PALETTE</span><span>{THEME_PRESETS.length} THEMES</span></div>
          <div className="settings-theme-grid">
            {THEME_PRESETS.map((theme) => <button type="button" key={theme.id} className={'settings-theme-card' + (themeId === theme.id ? ' active' : '')} onClick={() => setThemeId(theme.id)} aria-pressed={themeId === theme.id}>
              <span className="settings-theme-swatch" style={{ '--theme-swatch': theme.accent }}>{themeId === theme.id ? '✓' : ''}</span>
              <span className="settings-theme-copy"><span className="settings-theme-name">{theme.name}<b>{theme.tag}</b></span><span className="settings-theme-desc">{theme.desc}</span></span>
            </button>)}
          </div>
        </section>}
      </div>
    </div>
  </section>;
}

export default function App() {
  const [section, setSection] = useState('Home');
  const [themeId, setThemeId] = useState(() => localStorage.getItem('moovie-theme-v1') || 'solar-gold');
  const [watchlistFilter, setWatchlistFilter] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [movies, setMovies] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [similarSource, setSimilarSource] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchCountry, setSearchCountry] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [searchGenre, setSearchGenre] = useState('');
  const [searchMediaType, setSearchMediaType] = useState('all');
  const [searchSort, setSearchSort] = useState('relevance');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [detailCast, setDetailCast] = useState([]);
  const [detailVideos, setDetailVideos] = useState([]);
  const [detailRecommendations, setDetailRecommendations] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [tvRecommendations, setTvRecommendations] = useState([]);
  const [topSeries, setTopSeries] = useState([]);
  const [topMovies, setTopMovies] = useState([]);
  const [topPicks, setTopPicks] = useState([]);
  const [topPicksRefreshKey, setTopPicksRefreshKey] = useState(0);
  const [topPicksRefreshing, setTopPicksRefreshing] = useState(false);
  const [topPicksError, setTopPicksError] = useState('');
  const [likedRecommendations, setLikedRecommendations] = useState([]);
  const [hiddenPicks, setHiddenPicks] = useState([]);
  const [hiddenPicksRefreshKey, setHiddenPicksRefreshKey] = useState(0);
  const [hiddenPicksRefreshing, setHiddenPicksRefreshing] = useState(false);
  const [recommendationSeed, setRecommendationSeed] = useState(null);
  const [ratings, setRatings] = useState(readRatings);
  const [ratingPrompt, setRatingPrompt] = useState(null);
  const completionPromptedRef = useRef(new Set());
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerMessage, setTrailerMessage] = useState('');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerAspectRatio, setPlayerAspectRatio] = useState(() => {
    try { return localStorage.getItem('moovie-player-aspect-v1') || '16 / 9'; }
    catch { return '16 / 9'; }
  });
  const [playerSeason, setPlayerSeason] = useState(1);
  const [playerEpisode, setPlayerEpisode] = useState(1);
  const [playerSeasons, setPlayerSeasons] = useState([]); // [{season_number, episode_count}]
  // Chosen playback source for the title currently in the player. The saved
  // preference is per title (see providerPrefs.js); this is only the live
  // value while the player is open, so it always starts at the default and is
  // set from the stored preference before playback begins.
  const [playerProvider, setPlayerProvider] = useState('vidstuck');
  // Title waiting for a first-time server choice. Nothing plays until the user
  // picks, and the pick is what gets saved for that title.
  const [providerPrompt, setProviderPrompt] = useState(null);
  const [playerFrameLoaded, setPlayerFrameLoaded] = useState(false);
  const [playerFrameSlow, setPlayerFrameSlow] = useState(false);
  const playerHistoryRef = useRef(false);
  const detailHistoryRef = useRef(false);
  const playerFrameWrapRef = useRef(null);
  const playerFrameRef = useRef(null);
  const detailPageRef = useRef(null);
  const mainRef = useRef(null);
  const lastProgressSaveRef = useRef({ key: '', bucket: -1 });
  const watchTimeSampleRef = useRef({ key: '', currentTime: 0, pendingSeconds: 0 });
  const selectedDetailRequestRef = useRef('');
  const playerOpenRequestRef = useRef(false);

  const providerLabel = (PLAYER_PROVIDERS.find((provider) => provider.id === playerProvider) || PLAYER_PROVIDERS[0]).label;
  const playerSrc = selected
    ? buildPlayerUrl({ ...selected, season: playerSeason, episode: playerEpisode }, playerProvider)
    : '';

  const [profileAvatar, setProfileAvatar] = useState(() => { try { return localStorage.getItem('moovie-profile-avatar-v1') || '🎬'; } catch { return '🎬'; } });
  const [guestDisplayName, setGuestDisplayName] = useState(() => { try { return localStorage.getItem('moovie-profile-name-v1') || ''; } catch { return ''; } });
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
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

  // One owner for the watchlist: local state, the Firestore subscription, the
  // guest localStorage backup and every mutation. Mutations apply locally first
  // and roll back if the write is rejected, so the UI responds instantly and
  // still works offline (Firestore queues the write via its persistent cache).
  const {
    watchlist,
    toggleSaved,
    save: saveWatchItem,
    recordProgress,
    clear: clearWatchlist,
  } = useWatchlist({ authUser, authReady, onError: setCloudError });

  // Per-title player preference: Firestore for signed-in users, localStorage
  // for guests. Same optimistic shape as the watchlist above.
  const { getProvider, setProvider, waitForLoaded: waitForProviderPrefs } = useProviderPreferences({
    authUser,
    authReady,
    onError: setCloudError,
  });

  useEffect(() => {
    const preset = THEME_PRESETS.find((theme) => theme.id === themeId) || THEME_PRESETS[0];
    try {
      document.documentElement.style.setProperty('--accent', preset.accent);
      localStorage.setItem('moovie-theme-v1', themeId);
    } catch {}
  }, [themeId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError('');
    });
    return unsubscribe;
  }, []);

  // Remember the user's preferred player aspect ratio.
  useEffect(() => {
    try { localStorage.setItem('moovie-player-aspect-v1', playerAspectRatio); } catch {}
  }, [playerAspectRatio]);

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

  // Keep app sections and title details in browser history.
  useEffect(() => {
    function handleAppPopState(event) {
      if (playerHistoryRef.current) return; // player's own handler manages that entry
      const state = event.state || {};
      if (state.moovieTitle) {
        if (selectedDetailRequestRef.current === state.moovieTitle) return; // already showing it
        detailHistoryRef.current = true;
        const route = parseTitleRoute(window.location.pathname);
        if (route) openDetails({ id: route.id, media_type: route.media_type }, { pushRoute: false });
        return;
      }
      detailHistoryRef.current = false;
      setSelected(null);
      setSection(state.moovieSection || 'Home');
    }
    window.addEventListener('popstate', handleAppPopState);
    return () => window.removeEventListener('popstate', handleAppPopState);
  }, []);

  // Restore the section or title represented by the URL on initial load.
  useEffect(() => {
    const titleRoute = parseTitleRoute(window.location.pathname);
    if (titleRoute) {
      openDetails({ id: titleRoute.id, media_type: titleRoute.media_type }, { pushRoute: false });
      return;
    }
    const bootSection = sectionFromPath(window.location.pathname);
    if (bootSection !== 'Home') setSection(bootSection);
    window.history.replaceState({ moovieSection: bootSection }, '', window.location.href);
  }, []);

  // Always start a fresh page load at the top instead of restoring old scroll.
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const scrollToTop = () => window.scrollTo(0, 0);
    scrollToTop();
    window.addEventListener('pageshow', scrollToTop);
    return () => {
      window.removeEventListener('pageshow', scrollToTop);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  // Reset the details overlay to its top whenever a title is opened.
  useEffect(() => {
    if (selected) {
      if (detailPageRef.current) detailPageRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }, [selected?.id, selected?.media_type]);

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

  // Reset load state whenever the player or its source changes. A cross-origin
  // frame that refuses to be embedded cannot be detected from here — some
  // browsers still fire `load` with an error document — so this is a best-effort
  // timeout that offers a reliable fallback (open it in its own tab).
  useEffect(() => {
    if (!playerOpen || !playerSrc) return undefined;
    setPlayerFrameLoaded(false);
    setPlayerFrameSlow(false);
    const timer = window.setTimeout(() => setPlayerFrameSlow(true), 9000);
    return () => window.clearTimeout(timer);
  }, [playerOpen, playerSrc]);

  // Receive playback progress from whichever player is active.
  // Vidstuck reports VIDEO_PROGRESS, VidFast reports PLAYER_EVENT; both are
  // normalised by readPlaybackEvent and persisted through the same
  // recordProgress path, so Continue Watching and the watchlist schema are
  // unchanged.
  useEffect(() => {
    if (!playerOpen || !selected) return undefined;

    const activeTitle = { id: selected.id, media_type: selected.media_type || 'movie' };
    // Latest sample that has not reached the store yet. Buffering means the
    // final position survives a throttled tick when the player closes.
    let pendingSample = null;

    function persist(sample) {
      if (!sample) return;
      const watchedMinutes = watchTimeSampleRef.current.key === sample.key
        ? watchTimeSampleRef.current.pendingSeconds / 60
        : 0;
      if (watchTimeSampleRef.current.key === sample.key) watchTimeSampleRef.current.pendingSeconds = 0;
      recordProgress(sample.movie, { ...sample.progress, watchedMinutes });
    }

    function flush() {
      const sample = pendingSample;
      pendingSample = null;
      persist(sample);
    }

    function handleVideoProgress(event) {
      const frame = playerFrameRef.current;

      // Only the two trusted origins, and only the frame we mounted.
      if (!PLAYER_ORIGINS[event.origin]) return;
      if (!frame || event.source !== frame.contentWindow) return;

      let message = event.data;
      if (typeof message === 'string') {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }

      const sample = readPlaybackEvent(message, activeTitle);
      if (!sample) {
        // A pause we can't read a position from still deserves the last known
        // position to be written.
        if (message?.type === 'PLAYER_EVENT' && message?.data?.event === 'pause') flush();
        return;
      }

      // Seconds genuinely watched: a seek jumps far more than 15s, so a scrub
      // is not counted. This is what keeps the completion prompt honest.
      const key = `${sample.mediaType}-${activeTitle.id}`;
      const previous = watchTimeSampleRef.current;
      let pendingSeconds = previous.key === key ? previous.pendingSeconds : 0;
      if (previous.key === key) {
        const elapsed = sample.position - previous.currentTime;
        if (elapsed > 0 && elapsed <= 15) pendingSeconds += elapsed;
      }
      watchTimeSampleRef.current = { key, currentTime: sample.position, pendingSeconds };

      pendingSample = {
        key,
        movie: selected,
        progress: {
          progressMinutes: Math.round((sample.position / 60) * 10) / 10,
          runtimeMinutes: Math.round(sample.total / 60),
          season: sample.season,
          episode: sample.episode,
        },
      };

      // Completion: an explicit `ended`, or >=95% with real playback behind it.
      const finalEpisode = selected.last_episode_to_air;
      const isFinalTvEpisode = sample.mediaType === 'tv' && finalEpisode &&
        sample.season === Number(finalEpisode.season_number) &&
        sample.episode === Number(finalEpisode.episode_number);
      const nearEnd = sample.position / sample.total >= 0.95;
      const watchedEnough = pendingSeconds >= 90 || sample.total <= 180;
      const complete = sample.ended || (nearEnd && watchedEnough);

      if (
        complete &&
        (sample.mediaType === 'movie' || isFinalTvEpisode) &&
        !ratings[key] &&
        !completionPromptedRef.current.has(key)
      ) {
        completionPromptedRef.current.add(key);
        flush(); // save the final position before the player goes away
        setRatingPrompt({ ...selected, media_type: sample.mediaType });
        closePlayer();
        return;
      }

      const bucket = Math.floor(sample.position / 10);
      const sameBucket = lastProgressSaveRef.current.key === key &&
        lastProgressSaveRef.current.bucket === bucket;

      // Pause and `ended` save immediately; routine ticks save once per 10s.
      if (sample.paused || sample.ended || !sameBucket) {
        lastProgressSaveRef.current = { key, bucket };
        flush();
      }
    }

    window.addEventListener('message', handleVideoProgress);
    return () => {
      window.removeEventListener('message', handleVideoProgress);
      // Closing the player, switching providers or changing episodes must not
      // drop the last few seconds.
      flush();
    };
    // playerSrc is in the deps so switching provider, season or episode tears
    // the listener down and flushes the pending sample for the episode that
    // was just playing.
  }, [playerOpen, playerSrc, selected, ratings, recordProgress]);

  // Keep a local backup for every account so ratings survive reloads and cloud outages.
  useEffect(() => {
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings)); } catch {}
  }, [ratings]);

  // Signed-in users additionally sync ratings to their private Firestore collection.
  useEffect(() => {
    if (!authReady || !authUser) return undefined;
    const ratingsRef = collection(db, 'users', authUser.uid, 'ratings');
    const localRatings = readRatings();
    const unsubscribe = onSnapshot(ratingsRef, async (snapshot) => {
      const cloudRatings = {};
      snapshot.docs.forEach((item) => { cloudRatings[item.id] = Number(item.data().rating) || 0; });
      const mergedRatings = { ...localRatings, ...cloudRatings };
      setRatings(mergedRatings);
      const missing = Object.entries(localRatings).filter(([id]) => !cloudRatings[id]);
      if (missing.length) {
        try {
          await Promise.all(missing.map(([id, rating]) =>
            setDoc(doc(db, 'users', authUser.uid, 'ratings', id), {
              rating: Number(rating), updatedAt: serverTimestamp()
            }, { merge: true })
          ));
        } catch (writeError) {
          setCloudError(`Ratings sync failed: ${authErrorMessage(writeError)}`);
        }
      }
    }, (listenerError) => setCloudError(`Ratings sync failed: ${authErrorMessage(listenerError)}`));
    return unsubscribe;
  }, [authUser, authReady]);

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

  // Load dedicated top-rated movie and series shelves for the Home page.
  useEffect(() => {
    if (section !== 'Home') return undefined;
    let alive = true;
    Promise.allSettled([tmdb('/tv/top_rated'), tmdb('/movie/top_rated')]).then(([seriesResult, moviesResult]) => {
      if (!alive) return;
      setTopSeries(seriesResult.status === 'fulfilled'
        ? (seriesResult.value.results || []).filter((item) => item.poster_path).slice(0, 12).map((item) => ({ ...item, media_type: 'tv' }))
        : []);
      setTopMovies(moviesResult.status === 'fulfilled'
        ? (moviesResult.value.results || []).filter((item) => item.poster_path).slice(0, 12).map((item) => ({ ...item, media_type: 'movie' }))
        : []);
    });
    return () => { alive = false; };
  }, [section]);

  const recommendationSignature = watchlist.map((item) =>
    `${item.media_type || 'movie'}-${item.id}-${item.status || ''}-${(item.genre_ids || []).join(',')}`
  ).join('|');

  // Personalised recommendations prioritise six-star titles, then the user's highest ratings.
  useEffect(() => {
    if (section !== 'Home') return undefined;
    let alive = true;
    const ratedEntries = Object.entries(ratings)
      .filter(([, rating]) => Number(rating) >= 1 && Number(rating) <= 6)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    const sixStarItems = ratedEntries.filter(([, rating]) => Number(rating) === 6);
    const preferredRatings = sixStarItems.length ? sixStarItems : ratedEntries.slice(0, 3);
    const ratingSeeds = preferredRatings.map(([key]) => {
      const [mediaType, id] = key.split('-');
      return watchlist.find((item) => getDocId(item) === key) || { id: Number(id), media_type: mediaType };
    });
    const watchedSeed = watchlist.find((item) =>
      item.status === 'completed' || item.status === 'watching' || Number(item.progressMinutes) > 0
    ) || watchlist[0] || null;
    const seeds = ratingSeeds.length ? ratingSeeds : (watchedSeed ? [watchedSeed] : []);
    const seed = seeds[0] || null;
    setRecommendationSeed(seed);
    const hiddenPage = (hiddenPicksRefreshKey % 20) + 1;
    const hiddenPicksPath = `/discover/movie?sort_by=vote_average.desc&vote_average.gte=7&vote_count.gte=50&vote_count.lte=1200&include_adult=false&page=${hiddenPage}`;
    setHiddenPicksRefreshing(true);
    const hiddenMovieRequest = tmdb(hiddenPicksPath);
    const hiddenTvRequest = tmdb(`/discover/tv?sort_by=vote_average.desc&vote_average.gte=7&vote_count.gte=50&vote_count.lte=1200&include_adult=false&page=${hiddenPage}`);
    const likedRequests = seeds.slice(0, 3).map((item) =>
      tmdb(`/${item.media_type === 'tv' ? 'tv' : 'movie'}/${item.id}/recommendations`)
    );
    Promise.allSettled([hiddenMovieRequest, hiddenTvRequest, ...likedRequests]).then((results) => {
      if (!alive) return;
      const watchedIds = new Set(watchlist.map((item) => `${item.media_type || 'movie'}-${item.id}`));
      const hidden = results.slice(0, 2).flatMap((result, index) => {
        if (result.status !== 'fulfilled') return [];
        const type = index === 0 ? 'movie' : 'tv';
        return (result.value.results || [])
          .filter((item) => item.poster_path && !watchedIds.has(`${type}-${item.id}`))
          .map((item) => ({ ...item, media_type: type }));
      }).filter((item, index, all) => all.findIndex((other) => `${other.media_type}-${other.id}` === `${item.media_type}-${item.id}`) === index)
        .sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0)).slice(0, 6);
      setHiddenPicks(hidden);
      setHiddenPicksRefreshing(false);
      const merged = [];
      const seen = new Set(watchedIds);
      results.slice(2).forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const fallbackType = seeds[index]?.media_type === 'tv' ? 'tv' : 'movie';
        (result.value.results || []).forEach((item) => {
          const type = item.media_type || fallbackType;
          const key = `${type}-${item.id}`;
          if (item.poster_path && !seen.has(key) && merged.length < 10) {
            seen.add(key);
            merged.push({ ...item, media_type: type });
          }
        });
      });
      setLikedRecommendations(merged);
    });
    return () => { alive = false; };
  }, [section, recommendationSignature, hiddenPicksRefreshKey, JSON.stringify(ratings)]);

  // Find ten fresh Top 10 Picks, checking additional TMDB pages when needed.
  useEffect(() => {
    if (section !== 'Home') return undefined;
    let alive = true;
    const watchedIds = new Set(watchlist.map((item) => `${item.media_type || 'movie'}-${item.id}`));
    const currentPickIds = new Set(topPicks.map((item) => `${item.media_type || 'movie'}-${item.id}`));
    const firstPage = (topPicksRefreshKey % 20) + 1;

    async function loadFreshPicks() {
      setTopPicksRefreshing(true);
      setTopPicksError('');
      const freshPicks = [];
      const seenIds = new Set([...watchedIds, ...currentPickIds]);

      try {
        // Do not require a taste profile or restrictive genre combination.
        // Search several pages so a refresh can replace all ten current titles.
        for (let offset = 0; offset < 5 && freshPicks.length < 10; offset += 1) {
          const page = ((firstPage - 1 + offset) % 20) + 1;
          const data = await tmdb(`/discover/movie?sort_by=popularity.desc&vote_average.gte=6&vote_count.gte=50&include_adult=false&page=${page}`);
          if (!alive) return;

          for (const item of data.results || []) {
            const id = `movie-${item.id}`;
            if (!item.poster_path || seenIds.has(id)) continue;
            seenIds.add(id);
            freshPicks.push({ ...item, media_type: 'movie' });
            if (freshPicks.length === 10) break;
          }
        }

        if (!alive) return;
        if (freshPicks.length === 10) {
          setTopPicks(freshPicks);
        } else if (freshPicks.length > 0) {
          // Show the best available fresh set rather than an empty row.
          setTopPicks(freshPicks);
        }
      } catch (refreshError) {
        if (alive) console.error('Top 10 Picks refresh failed:', refreshError);
      } finally {
        if (alive) setTopPicksRefreshing(false);
      }
    }

    loadFreshPicks();
    const refreshTimer = window.setInterval(() => {
      setTopPicksRefreshKey((current) => current + 1);
    }, 5 * 60 * 1000);

    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
    };
  }, [section, recommendationSignature, topPicksRefreshKey]);

  // Keep the current set in the exclusion list when a refresh starts.
  useEffect(() => {
    if (topPicks.length) setTopPicksError('');
  }, [topPicks]);

  // Automatically rotate featured titles.
useEffect(() => {
  if (section !== 'Home' || query || movies.length < 2) return;
  // Respect reduced-motion: leave the first featured title on screen instead
  // of rotating it every 7s (WCAG 2.2.2 — moving content the user can't stop).
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const timer = setInterval(() => {
    setHeroIndex((current) => (current + 1) % movies.length);
  }, 7000);

  return () => clearInterval(timer);
}, [movies, section, query]);

  const searchFiltersActive = Boolean(searchCountry || searchYear || searchGenre || searchMediaType !== 'all' || searchSort !== 'relevance');
  async function fetchSearchPage(page, signal, filtersActive) {
    if (filtersActive && (!query.trim() || searchCountry || searchYear || searchGenre)) {
      const common = [
        'include_adult=false',
        'sort_by=' + (searchSort === 'oldest' ? 'primary_release_date.asc' : searchSort === 'newest' ? 'primary_release_date.desc' : searchSort === 'rating' ? 'vote_average.desc' : 'popularity.desc'),
        searchCountry ? `with_origin_country=${encodeURIComponent(searchCountry)}` : '',
        searchGenre ? `with_genres=${encodeURIComponent(searchGenre)}` : '',
      ].filter(Boolean).join('&');
      const movieParams = [common, searchYear ? `primary_release_year=${searchYear}` : '', `page=${page}`].filter(Boolean).join('&');
      const tvParams = [
        'include_adult=false',
        `sort_by=${searchSort === 'oldest' ? 'first_air_date.asc' : searchSort === 'newest' ? 'first_air_date.desc' : searchSort === 'rating' ? 'vote_average.desc' : 'popularity.desc'}`,
        searchCountry ? `with_origin_country=${encodeURIComponent(searchCountry)}` : '',
        searchGenre ? `with_genres=${encodeURIComponent(searchGenre)}` : '',
        searchYear ? `first_air_date_year=${searchYear}` : '',
        `page=${page}`,
      ].filter(Boolean).join('&');
      const [movieData, tvData] = await Promise.all([
        tmdb(`/discover/movie?${movieParams}`, signal),
        tmdb(`/discover/tv?${tvParams}`, signal),
      ]);
      let results = [
        ...(movieData.results || []).map((item) => ({ ...item, media_type: 'movie' })),
        ...(tvData.results || []).map((item) => ({ ...item, media_type: 'tv' })),
      ];
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        results = results.filter((item) => `${item.title || item.name || ''} ${item.overview || ''}`.toLowerCase().includes(needle));
      }
      return { results, totalPages: Math.min(Number(movieData.total_pages) || 1, Number(tvData.total_pages) || 1) };
    }
    const data = await tmdb(`/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false&page=${page}`, signal);
    return {
      results: (data.results || []).filter((item) => item.media_type !== 'person'),
      totalPages: Math.min(Number(data.total_pages) || 1, 500),
    };
  }

  useEffect(() => {
    if (section !== 'Search') {
      if (!query.trim()) {
        setSearchResults([]);
        setSearchPage(1);
        setSearchTotalPages(1);
        return undefined;
      }
      let alive = true;
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        try {
          const { results, totalPages } = await fetchSearchPage(1, controller.signal, false);
          if (alive) {
            setSearchResults(results);
            setSearchTotalPages(totalPages);
            setSearchPage(1);
          }
        } catch (err) {
          if (alive && err.name !== 'AbortError') setError(err.message);
        }
      }, 350);
      return () => { alive = false; clearTimeout(timer); controller.abort(); };
    }

    if (!query.trim() && !searchFiltersActive) {
      setSearchResults([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const { results, totalPages } = await fetchSearchPage(1, controller.signal, searchFiltersActive);
        if (!alive) return;
        setSearchResults(results);
        setSearchTotalPages(totalPages);
        setSearchPage(1);
      } catch (err) {
        if (alive && err.name !== 'AbortError') setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    }, query.trim() ? 350 : 80);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [section, query, searchCountry, searchYear, searchGenre, searchMediaType, searchSort]);
  async function loadMoreSearchResults() {
    if (searchLoadingMore) return;
    const nextPage = searchPage + 1;
    if (nextPage > searchTotalPages) return;
    setSearchLoadingMore(true);
    try {
      const { results } = await fetchSearchPage(nextPage, undefined, section === 'Search' ? searchFiltersActive : false);
      const seen = new Set(searchResults.map((item) => `${item.media_type || 'movie'}-${item.id}`));
      const fresh = results.filter((item) => {
        const key = `${item.media_type || 'movie'}-${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSearchResults((current) => [...current, ...fresh]);
      setSearchPage(nextPage);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setSearchLoadingMore(false);
    }
  }

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
      if (searchMediaType !== 'all') results = results.filter((item) => item.media_type === searchMediaType);
      if (searchSort === 'newest' || searchSort === 'oldest') {
        results.sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          return searchSort === 'newest' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        });
      } else if (searchSort === 'rating') {
        results.sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0));
      }
      return results;
    }
    if (!query.trim() && section === 'Watchlist') {
      return watchlist.filter((item) => watchlistFilter === 'all' || item.status === watchlistFilter);
    }
    if (!query.trim() && section === 'Watched') {
      return watchlist.filter((item) => item.status === 'completed');
    }
    return query.trim() ? searchResults : movies;
  }, [section, query, searchResults, movies, watchlist, watchlistFilter, searchCountry, searchYear, searchGenre, searchMediaType, searchSort, searchFiltersActive]);

  const selectedWatchlistItem = selected && watchlist.find((item) =>
    Number(item.id) === Number(selected.id) &&
    (item.media_type || 'movie') === (selected.media_type || 'movie')
  );
  const isSaved = Boolean(selectedWatchlistItem && selectedWatchlistItem.status !== 'completed' && selectedWatchlistItem.status !== 'dropped');
  const isWatched = Boolean(selectedWatchlistItem?.status === 'completed');

  async function saveRating(movie, value) {
    const rating = Math.max(1, Math.min(6, Number(value)));
    const key = getDocId(movie);
    setRatings((current) => {
      const next = { ...current, [key]: rating };
      // Write immediately as well as through the state effect, avoiding a lost save on quick reloads.
      try { localStorage.setItem(RATINGS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    if (authUser) {
      try {
        await setDoc(doc(db, 'users', authUser.uid, 'ratings', key), { rating, updatedAt: serverTimestamp() }, { merge: true });
        setCloudError('');
      } catch (writeError) {
        setCloudError(`Rating could not sync: ${authErrorMessage(writeError)}`);
      }
    }
    setRatingPrompt(null);
  }

  /** Heart button — optimistic add/remove, shared by every surface. */
  async function toggleWatchlist(movie) {
    await toggleSaved(movie);
  }

  async function removeFromContinueWatching(movie) {
    if (!movie) return;
    await saveWatchItem(movie, { hideFromContinueWatching: true });
  }

  async function saveProfileName() {
    const nextName = profileNameDraft.trim();
    if (!nextName) { setAuthError('Enter a display name first.'); return; }
    setProfileSaveBusy(true); setAuthError('');
    try {
      if (authUser) { await updateProfile(authUser, { displayName: nextName }); setProfileNameDraft(nextName); setAuthUser(auth.currentUser); }
      else { localStorage.setItem('moovie-profile-name-v1', nextName); setGuestDisplayName(nextName); }
    } catch (failure) { setAuthError(authErrorMessage(failure)); }
    finally { setProfileSaveBusy(false); }
  }

  function chooseProfileAvatar(avatar) {
    setProfileAvatar(avatar);
    try { localStorage.setItem('moovie-profile-avatar-v1', avatar); } catch {}
  }

  async function setWatchStatus(movie, status) {
    if (!movie) return;
    // saveWatchItem normalises the status and upserts, so a title that isn't in
    // the watchlist yet is added rather than silently ignored.
    await saveWatchItem(movie, { status });
  }

  async function toggleWatched(movie) {
    const existing = watchlist.find((item) => getDocId(item) === getDocId(movie));
    await setWatchStatus(movie, existing?.status === 'completed' ? 'plan_to_watch' : 'completed');
  }

  function goToSection(next) {
    setSection(next);
    window.history.pushState({ moovieSection: next }, '', routeHref(SECTION_ROUTES[next] ?? ''));
  }

  async function openDetails(movie, options = {}) {
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const id = Number(movie.id);
    const requestKey = `${mediaType}-${id}`;
    selectedDetailRequestRef.current = requestKey;
    if (options.pushRoute !== false) {
      window.history.pushState({ moovieTitle: requestKey }, '', routeHref(`title/${requestKey}`));
      detailHistoryRef.current = true;
    }

    setSelected({ ...movie, media_type: mediaType });
    setPlayerOpen(false);
    setTrailerOpen(false);
    setDetailTab('overview');
    setDetailCast([]);
    setDetailVideos([]);
    setDetailRecommendations([]);
    setDetailLoading(true);
    setTrailerUrl('');
    setTrailerMessage('');

    const isCurrentRequest = () => selectedDetailRequestRef.current === requestKey;

    const [detailsResult, creditsResult, videosResult, recommendationsResult] = await Promise.allSettled([
      tmdb(`/${mediaType}/${id}`),
      tmdb(`/${mediaType}/${id}/credits`),
      tmdb(`/${mediaType}/${id}/videos`),
      tmdb(`/${mediaType}/${id}/recommendations`),
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

    if (recommendationsResult.status === 'fulfilled') {
      setDetailRecommendations((recommendationsResult.value.results || [])
        .filter((item) => item.id !== id && item.poster_path)
        .slice(0, 12)
        .map((item) => ({ ...item, media_type: mediaType })));
    }

    setDetailLoading(false);
  }

  /** Called when playback starts: flag the title as watching/continue-watching. */
  async function markAsWatching(movie) {
    if (!movie) return;
    const existing = watchlist.find((item) => getDocId(item) === getDocId(movie));
    await saveWatchItem(movie, {
      status: 'watching',
      hideFromContinueWatching: false,
      // Only seed progress for a title we haven't tracked yet — never reset an
      // existing resume position back to zero.
      ...(existing ? {} : { progressMinutes: 0 }),
    });
  }

  // Every entry point (Watch Now, hero, Continue Watching, detail page) lands
  // here. The provider is decided before the player opens: a saved preference
  // is used silently, and a title with no preference gets the chooser.
  async function openPlayer(movieToPlay = selected) {
    if (playerOpen || !movieToPlay) return;

    const playableMovie = {
      ...movieToPlay,
      media_type: movieToPlay.media_type || 'movie',
    };
    if (!buildPlayerUrl(playableMovie)) return;

    // Wait briefly for the stored preferences so a click during the initial
    // read doesn't look like a title the user has never chosen a server for.
    // Bounded: a slow read must never make Watch Now feel dead, so after
    // PLAYER_PREFS_WAIT_MS we continue with whatever has loaded — usually
    // nothing, which falls through to the chooser below.
    if (playerOpenRequestRef.current) return;
    playerOpenRequestRef.current = true;
    await waitForPrefsWithTimeout(waitForProviderPrefs);
    playerOpenRequestRef.current = false;

    const savedProvider = getProvider(playableMovie);
    if (!savedProvider) {
      setProviderPrompt(playableMovie);
      return;
    }

    setPlayerProvider(savedProvider);
    startPlayback(playableMovie);
  }

  // First-time choice: save it for this title, then play with it. There is no
  // follow-up prompt — the choice the user just made is the saved preference.
  function chooseInitialProvider(provider) {
    const movie = providerPrompt;
    if (!movie) return;
    setProviderPrompt(null);
    setPlayerProvider(provider);
    void setProvider(movie, provider);
    startPlayback(movie);
  }

  // In-player switch: same title, same episode, different server. The saved
  // preference is updated immediately, and the progress effect flushes the
  // pending sample because playerSrc changes (so the position is written
  // before the new frame starts loading). Neither provider exposes a start
  // position parameter we can rely on, so playback resumes at 00:00 and the
  // user picks up manually.
  function switchProvider(provider) {
    if (!selected || provider === playerProvider) return;
    setPlayerProvider(provider);
    void setProvider(selected, provider);
  }

  function startPlayback(playableMovie) {
    setPlayerSeason(Math.max(1, Math.floor(Number(playableMovie.season) || 1)));
    setPlayerEpisode(Math.max(1, Math.floor(Number(playableMovie.episode) || 1)));
    if (playableMovie.media_type === 'tv') {
      setPlayerSeasons([]);
      tmdb(`/tv/${Number(playableMovie.id)}`)
        .then((data) => setPlayerSeasons((data.seasons || []).filter((s) => Number(s.season_number) > 0 && Number(s.episode_count) > 0)))
        .catch(() => setPlayerSeasons([]));
    } else {
      setPlayerSeasons([]);
    }

    setSelected(playableMovie);
    lastProgressSaveRef.current = { key: '', bucket: -1 };
    watchTimeSampleRef.current = { key: getDocId(playableMovie), currentTime: 0, pendingSeconds: 0 };

    // Open playback immediately; update the watchlist in the background.
    window.history.pushState({ mooviePlayer: true }, '', window.location.href);
    playerHistoryRef.current = true;
    setPlayerOpen(true);
    void markAsWatching(playableMovie);
  }
  function closePlayer() {
    setPlayerOpen(false);
    if (playerHistoryRef.current) {
      playerHistoryRef.current = false;
      window.history.back();
    }
  }

  function closeDetails() {
    if (detailHistoryRef.current) {
      detailHistoryRef.current = false;
      window.history.back(); // popstate handler clears `selected`
    } else {
      setSelected(null);
      // Direct-load case: fix the URL so a later refresh doesn't reopen the overlay
      window.history.replaceState({ moovieSection: section }, '', routeHref(SECTION_ROUTES[section] ?? ''));
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
    // Clear the local backups *before* auth flips. They are a guest-only
    // fallback, but the sign-in migration uploads any local title/rating the
    // cloud account doesn't have — so leaving them behind handed the next
    // account that signed in on this browser the previous user's library.
    clearLocalLibraryBackup();
    try {
      await signOut(auth);
      clearWatchlist();
      setRatings({});
      setAuthOpen(false);
    } catch (signOutError) {
      setAuthError(authErrorMessage(signOutError));
    }
  }

  const accountName = authUser?.displayName || guestDisplayName || authUser?.email?.split('@')[0] || 'Movie lover';
  useEffect(() => { setProfileNameDraft(accountName); }, [accountName]);
  const accountInitial = accountName.charAt(0).toUpperCase() || 'M';
  const ratingEntries = Object.entries(ratings).filter(([, value]) => Number(value) >= 1 && Number(value) <= 6);
  const profileRatedTitles = watchlist.filter((item) => Number(ratings[getDocId(item)]) >= 1).sort((a,b) => Number(ratings[getDocId(b)]) - Number(ratings[getDocId(a)]));
  const profileRecentlyWatched = [...watchlist].filter((item) => Number(item.totalWatchedMinutes)>0 || item.status==='completed' || item.status==='watching').sort((a,b) => {
    const stamp=(item)=>{const v=item.updatedAt||item.addedAt;if(v?.toMillis)return v.toMillis();if(v?.seconds)return v.seconds*1000;return Number(v)||0;};return stamp(b)-stamp(a);
  }).slice(0,12);
  const genreTotals = new Map();
  watchlist.filter((item)=>item.status==='completed'||item.status==='watching'||Number(item.totalWatchedMinutes)>0)
    .forEach((item)=>(item.genre_ids||[]).forEach((id)=>genreTotals.set(Number(id),(genreTotals.get(Number(id))||0)+1)));
  const favouriteGenreId=[...genreTotals.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const profileStats={
    collectionCount:watchlist.length,
    watchHours:(watchlist.reduce((sum,item)=>sum+(Number(item.totalWatchedMinutes)||0),0)/60).toFixed(1),
    moviesCompleted:watchlist.filter((item)=>item.status==='completed'&&item.media_type!=='tv').length,
    seriesCompleted:watchlist.filter((item)=>item.status==='completed'&&item.media_type==='tv').length,
    ratingCount:ratingEntries.length,ratings,
    favoriteGenre:BROWSE_GENRES.find((genre)=>genre.id===favouriteGenreId)?.name||'',
    watching:watchlist.filter((item)=>item.status==='watching').length,
    planToWatch:watchlist.filter((item)=>item.status==='plan_to_watch').length,
    completed:watchlist.filter((item)=>item.status==='completed').length,
    dropped:watchlist.filter((item)=>item.status==='dropped').length,
  };
  async function deleteAccountAndData(){
    if(!authUser||!window.confirm('Delete your Moovie account and its stored data? This cannot be undone.'))return;
    setAuthBusy(true);setAuthError('');
    try{
      const providerIds=authUser.providerData.map((provider)=>provider.providerId);
      if(providerIds.includes('google.com')){
        await reauthenticateWithPopup(authUser,googleProvider);
      }else if(providerIds.includes('password')&&authUser.email){
        const password=window.prompt('Enter your account password to confirm deletion:');
        if(!password)throw new Error('Account deletion cancelled. Your data was not changed.');
        await reauthenticateWithCredential(authUser,EmailAuthProvider.credential(authUser.email,password));
      }else{
        throw new Error('This sign-in method needs a fresh sign-in before account deletion.');
      }
      for(const name of ['watchlist','ratings','following','notifications']){
        const snapshot=await getDocs(collection(db,'users',authUser.uid,name));
        await Promise.all(snapshot.docs.map((entry)=>deleteDoc(entry.ref)));
      }
      const reviews=await getDocs(firestoreQuery(collection(db,'reviews'),where('uid','==',authUser.uid)));
      await Promise.all(reviews.docs.map((entry)=>deleteDoc(entry.ref)));
      await deleteDoc(doc(db,'profiles',authUser.uid));
      clearLocalLibraryBackup();
      await deleteUser(authUser);clearWatchlist();setRatings({});goToSection('Home');
    }catch(failure){setAuthError(failure?.message==='Account deletion cancelled. Your data was not changed.'?failure.message:failure?.code==='auth/wrong-password'?'Password was incorrect. No data was deleted.':authErrorMessage(failure));}
    finally{setAuthBusy(false);}
  }
  function clearGuestData(){
    if(!window.confirm('Clear this browser’s Moovie watchlist and ratings?'))return;
    clearLocalLibraryBackup();clearWatchlist();setRatings({});
  }

  const continueWatchingItems = useMemo(() => {
    const timestamp = (value) => {
      if (value?.toMillis) return value.toMillis();
      if (value?.seconds) return value.seconds * 1000;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };
    return watchlist
      .filter((item) => !item.hideFromContinueWatching && item.status !== 'completed' && item.status !== 'dropped' &&
        (item.media_type === 'tv' || item.status === 'watching' || Number(item.progressMinutes) > 0))
      .sort((a, b) => timestamp(b.updatedAt || b.addedAt) - timestamp(a.updatedAt || a.addedAt));
  }, [watchlist]);

  // Reveal sections as they scroll into view; re-runs when the page content
  // is replaced (section change, search, loading -> results).
  useReveal(mainRef, [section, query, loading]);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); goToSection('Home'); setQuery(''); }}>
          <span className="brand-mark"><Clapperboard size={21} /></span><span>moovie<span className="brand-dot">.</span></span>
        </a>
        <div className="sidebar-menu-row"><div className="side-label">MENU</div><button className="sidebar-toggle" onClick={()=>setSidebarCollapsed((value)=>!value)} aria-label={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'} title={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'}>{sidebarCollapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button></div>
        <nav className="side-nav">
          <button className={section === 'Home' ? 'active' : ''} onClick={() => { goToSection('Home'); setQuery(''); }}><Film /> Home</button>
          <button className={section === 'Discover' ? 'active' : ''} onClick={() => { goToSection('Discover'); setQuery(''); }}><Compass /> Discover</button>
          <button className={section === 'Search' ? 'active' : ''} onClick={() => { goToSection('Search'); setQuery(''); setError(''); }}><Search /> Search</button>
          <button className={section === 'Profile' ? 'active' : ''} onClick={() => { goToSection('Profile'); setQuery(''); setError(''); }}><UserRound /> Profile</button>
          <button className={section === 'Settings' ? 'active' : ''} onClick={() => { goToSection('Settings'); setQuery(''); }}><Settings /> Settings</button>
          <button className={section === 'Watchlist' ? 'active' : ''} onClick={() => { goToSection('Watchlist'); setQuery(''); setError(''); }}><Bookmark /> Watchlist <span className="watchlist-count">{watchlist.filter((item) => item.status !== 'completed' && item.status !== 'dropped').length}</span></button>
          <button className={section === 'Watched' ? 'active' : ''} onClick={() => { goToSection('Watched'); setQuery(''); setError(''); }}><CheckCircle2 /> Completed <span className="watchlist-count">{watchlist.filter((item) => item.status === 'completed').length}</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="profile-chip profile-chip-button" onClick={() => { goToSection('Profile'); setQuery(''); }}>
            <div className="avatar">{authUser ? accountInitial : 'M'}</div>
            <div><strong>{authUser ? accountName : 'Movie lover'}</strong><span>{authUser ? 'Signed in' : 'Guest account'}</span></div>
          </button>
        </div>
      </aside>

      <main className="main-content" ref={mainRef}>
        <header className="topbar">
          <div className="mobile-brand"><Clapperboard size={20} /> moovie<span>.</span></div>
          <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies, series..." /><kbd>⌘ K</kbd></div>
          <button className="profile-button" aria-label="Open profile" onClick={() => { goToSection('Profile'); setQuery(''); }}><UserRound size={19} /></button>
        </header>

        {/* Keyed on the section so every navigation replays the entry animation. */}
        <div className="page-view" key={section}>
{!query && section === 'Home' && movies[heroIndex] && (() => {
  const featured = movies[heroIndex]
  const featuredType = featured.media_type || 'movie';
  const featuredTitle = featured.title || featured.name || 'Featured title';
  const featuredSaved = watchlist.some((item) =>
    Number(item.id) === Number(featured.id) &&
    (item.media_type || 'movie') === featuredType &&
    item.status !== 'completed' && item.status !== 'dropped'
  );
  const genreIds=Array.isArray(featured.genre_ids)?featured.genre_ids:[],playerUrl=buildPlayerUrl(featured);
  return <section className="hero-banner" aria-label="Featured trending titles">{featured.backdrop_path&&<img key={featured.backdrop_path} className="hero-backdrop" src={IMAGE_ROOT+'w1280'+featured.backdrop_path} alt=""/>}<div className="hero-shade"/><div className="hero-copy" key={`${featuredType}-${featured.id}`}><span className="hero-tag">FEATURED THIS WEEK</span><h2>{featuredTitle}</h2><div className="hero-meta hero-meta-redesign"><span className="hero-rating"><Star size={13} fill="currentColor"/> {Number(featured.vote_average||0).toFixed(1)}</span><span className="hero-status"><i/> {getFeaturedStatus(featured)}</span><span className="hero-meta-type">{featuredType==='tv'?'SERIES':'MOVIE'}</span></div><div className="hero-genres">{genreIds.slice(0,3).map(id=>GENRE_NAMES[id]?<span className="genre-pill" key={id}>{GENRE_NAMES[id]}</span>:null)}</div><p>{featured.overview||'Discover your next favourite story.'}</p><div className="hero-actions">{playerUrl&&<button className="hero-button" onClick={()=>openPlayer(featured)}><Play size={15} fill="currentColor"/> Watch Now</button>}<button className={`hero-add-button ${featuredSaved?'is-saved':''}`} onClick={()=>toggleWatchlist(featured)} aria-label={featuredSaved?'Remove featured title from watchlist':'Add featured title to watchlist'}>{featuredSaved?'✓':'＋'}</button><button className="hero-secondary hero-explore" onClick={()=>{setSimilarSource({...featured,media_type:featuredType});setQuery('');goToSection('Similar');}}>Explore More Like This</button></div></div>{movies.length>1&&<div className="hero-controls"><button className="hero-arrow" aria-label="Previous featured title" onClick={()=>setHeroIndex(current=>(current-1+movies.length)%movies.length)}>‹</button><div className="hero-dots" aria-label="Choose featured title">{movies.map((movie,index)=><button key={`${movie.media_type||'movie'}-${movie.id}`} className={`hero-dot ${index===heroIndex?'active':''}`} aria-label={`Show featured title ${index+1}`} aria-current={index===heroIndex?'true':undefined} onClick={()=>setHeroIndex(index)}/>)}</div><button className="hero-arrow" aria-label="Next featured title" onClick={()=>setHeroIndex(current=>(current+1)%movies.length)}>›</button></div>}</section>;
})()}


        {section === 'Home' && !query && continueWatchingItems.length > 0 && <section className="continue-section">
          <div className="section-heading">
            <div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching</h2></div>
            <span className="result-count">{Math.min(continueWatchingItems.length, 8)} OF {continueWatchingItems.length} TITLES</span>
          </div>
          <div className="continue-grid">
            {continueWatchingItems.slice(0, 8).map((item) => {
              const runtime = Number(item.runtimeMinutes) || 0;
              const progress = Math.max(0, Number(item.progressMinutes) || 0);
              const percent = runtime > 0 ? Math.min(100, Math.max(0, (progress / runtime) * 100)) : 0;
              const title = item.title || item.name || 'Untitled';
              const remaining = runtime > 0 && progress > 0 ? Math.max(0, runtime - progress) : 0;
              const progressLabel=item.media_type==='tv'?'S'+String(item.season||1).padStart(2,'0')+'E'+String(item.episode||1).padStart(2,'0'):remaining>0?remaining+' MIN LEFT':'READY TO RESUME';
              return <button className="continue-card" key={(item.media_type||'movie')+'-'+item.id} onClick={()=>openPlayer(item)} aria-label={'Resume '+title}><div className="continue-poster" style={{'--continue-backdrop':item.backdrop_path?'url('+IMAGE_ROOT+'w780'+item.backdrop_path+')':'none'}}>{item.backdrop_path?<img src={IMAGE_ROOT+'w780'+item.backdrop_path} alt="" loading="lazy"/>:<div className="poster-fallback"><Film size={25}/></div>}<span className="continue-play"><Play size={17} fill="currentColor"/></span><span className="continue-remove" role="button" tabIndex={0} aria-label={'Remove '+title+' from Continue Watching'} onClick={event=>{event.preventDefault();event.stopPropagation();removeFromContinueWatching(item);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();removeFromContinueWatching(item);}}}><X size={14}/></span><span className="continue-label">{progressLabel}</span><span className="continue-progress"><i style={{width:percent+'%'}}/></span></div><div className="continue-info"><strong>{title}</strong><span>{item.media_type==='tv'?'SERIES · '+progressLabel:'MOVIE · '+progressLabel}</span></div></button>;
            })}
          </div>
        </section>}
        {section === 'Home' && !query && (recommendationSeed || likedRecommendations[0]) && (() => {const pick=recommendationSeed||likedRecommendations[0],pickTitle=pick.title||pick.name||'Featured pick',pickType=pick.media_type==='tv'?'SERIES':'MOVIE';return <section className="featured-pick-banner"><div className="featured-pick-poster">{pick.poster_path?<img src={IMAGE_ROOT+'w342'+pick.poster_path} alt={pickTitle+' poster'} loading="lazy"/>:<Film size={30}/>}</div><div className="featured-pick-art" style={{backgroundImage:pick.backdrop_path?'linear-gradient(90deg,#111014 0%,#111014dc 42%,#11101450 100%),url('+IMAGE_ROOT+'w780'+pick.backdrop_path+')':'linear-gradient(90deg,#111014,#1b171e)'}}/><div className="featured-pick-copy"><span className="featured-pick-chip">EDITOR'S PICK</span><h2>{pickTitle}</h2><div className="featured-pick-rating"><Star size={13} fill="currentColor"/> {Number(pick.vote_average||0).toFixed(1)} · {pickType}</div><div className="hero-genres">{(Array.isArray(pick.genre_ids)?pick.genre_ids:[]).slice(0,3).map(id=>GENRE_NAMES[id]?<span className="genre-pill" key={id}>{GENRE_NAMES[id]}</span>:null)}</div><p>{pick.overview||'A title selected around your taste.'}</p><div className="hero-actions">{buildPlayerUrl(pick)&&<button className="hero-button" onClick={()=>openPlayer(pick)}><Play size={14} fill="currentColor"/> Watch Now</button>}<button className="hero-secondary" onClick={()=>openDetails(pick)}>Details</button></div></div></section>;})()}
        {section === 'Home' && !query && <>
          <section className="ranked-columns"><RankedList title="Top Movies This Week" eyebrow="RANKED FILMS" movies={topMovies} onSelect={openDetails} type="MOVIE"/><RankedList title="Top Series This Week" eyebrow="RANKED SERIES" movies={topSeries} onSelect={openDetails} type="SERIES"/></section>
          <PosterRow
            eyebrow="CURATED FOR YOU"
            title="Top 10 Picks for You"
            movies={topPicks}
            onSelect={openDetails}
            onRefresh={() => setTopPicksRefreshKey((current) => current + 1)}
            refreshing={topPicksRefreshing}
            statusMessage={topPicksError}
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
            onRefresh={() => setHiddenPicksRefreshKey((current) => current + 1)}
            refreshing={hiddenPicksRefreshing}
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

        {section === 'Settings' ? <SettingsPage authUser={authUser} accountName={accountName} profileAvatar={profileAvatar} profileNameDraft={profileNameDraft} onProfileNameChange={setProfileNameDraft} onSaveProfileName={saveProfileName} profileSaveBusy={profileSaveBusy} onChooseAvatar={chooseProfileAvatar} onSignOut={handleSignOut} onSignIn={() => { setAuthMode('login'); setAuthError(''); setAuthOpen(true); }} onDeleteAccount={deleteAccountAndData} onClearGuestData={clearGuestData} authError={authError} authBusy={authBusy} themeId={themeId} setThemeId={setThemeId}/> : section === 'Profile' ? <ProfileDashboard authUser={authUser} accountName={accountName} profileAvatar={profileAvatar} profileNameDraft={profileNameDraft} onProfileNameChange={setProfileNameDraft} onSaveProfileName={saveProfileName} profileSaveBusy={profileSaveBusy} onChooseAvatar={chooseProfileAvatar} stats={profileStats} recentlyWatched={profileRecentlyWatched} topRatedTitles={profileRatedTitles.slice(0,12)} onOpenTitle={openDetails} onSignOut={handleSignOut} onSignIn={()=>{setAuthMode('login');setAuthError('');setAuthOpen(true);}} onDeleteAccount={deleteAccountAndData} onClearGuestData={clearGuestData} authError={authError} authBusy={authBusy}/> : section === 'Search' ? <section className="search-discovery-page">
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
              <label><span>TYPE</span><select value={searchMediaType} onChange={(event) => setSearchMediaType(event.target.value)}><option value="all">Movies & series</option><option value="movie">Movies only</option><option value="tv">Series only</option></select></label>
              <label><span>SORT BY</span><select value={searchSort} onChange={(event) => setSearchSort(event.target.value)}><option value="relevance">Relevance / Popular</option><option value="rating">Highest rated</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            </div>
            {(searchCountry || searchYear || searchGenre || searchMediaType !== 'all' || searchSort !== 'relevance' || query) && <button className="search-clear-filters" onClick={() => { setQuery(''); setSearchCountry(''); setSearchYear(''); setSearchGenre(''); setSearchMediaType('all'); setSearchSort('relevance'); }}>Clear search and filters</button>}
          </div>
          {query.trim() || searchFiltersActive ? <section className="catalog-section search-results-section">
            <div className="section-heading"><div><span className="eyebrow">{query.trim() ? 'MATCHING TITLES' : 'FILTERED DISCOVERY'}</span><h2>{query.trim() ? `Results for “${query}”` : 'Explore your filters'}</h2></div><span className="result-count">{visibleMovies.length} TITLES</span></div>
            {loading && <PosterSkeletons count={12} />}
            {!loading && error && <div className="status-message error"><strong>Search unavailable</strong><span>{error}</span></div>}
            {!loading && !error && visibleMovies.length === 0 && <div className="status-message">No titles match those filters. Try changing a filter or broadening your search.</div>}
            {!loading && <div className="movie-grid">{visibleMovies.map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} showMoreDetails />)}</div>}
            {!loading && visibleMovies.length > 0 && searchPage < searchTotalPages && (
              <div className="search-load-more">
                <button className="search-load-more-button" onClick={loadMoreSearchResults} disabled={searchLoadingMore}>
                  {searchLoadingMore ? 'Loading…' : 'Load more results'}
                </button>
              </div>
            )}
          </section> : <>
            <div className="search-recommendation-intro"><span className="eyebrow">PICKED AROUND YOUR TASTE</span><h2>Recommended for you</h2><p>Based on your watchlist and the titles you've explored.</p></div>
            <div className="movie-grid search-recommendation-grid">{[...likedRecommendations, ...topPicks, ...tvRecommendations].filter((item, index, all) => all.findIndex((other) => `${other.media_type || 'movie'}-${other.id}` === `${item.media_type || 'movie'}-${item.id}`) === index).slice(0, 18).map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} />)}</div>
            {![...likedRecommendations, ...topPicks, ...tvRecommendations].length && <div className="status-message">Moovie is preparing recommendations. Save or watch a few titles to personalise this space.</div>}
          </>}
        </section> : <>
        {section === 'Watchlist' && !query && <div className="watchlist-status-tabs" role="group" aria-label="Filter watchlist by status">{[['all','All titles'],['watching','Watching'],['plan_to_watch','Plan to Watch'],['completed','Completed'],['dropped','Dropped']].map(([value,label])=><button key={value} className={watchlistFilter===value?'active':''} onClick={()=>setWatchlistFilter(value)}>{label}<span>{value==='all'?watchlist.length:watchlist.filter((item)=>item.status===value).length}</span></button>)}</div>}
        <section className="catalog-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {section === 'Home' && !query ? 'TRENDING NOW' : query ? 'MATCHING TITLES'
                  : section === 'Discover' ? 'CRITIC FAVOURITES'
                    : section === 'Watchlist' ? 'YOUR COLLECTION'
                      : section === 'Watched' ? 'YOUR COMPLETED TITLES'
                        : section === 'Similar' ? 'MORE TO EXPLORE'
                          : 'UPDATED WEEKLY'}
              </span>
              <h2>
                {section === 'Home' && !query ? 'Trending Now' : query ? `Results for “${query}”`
                  : section === 'Discover' ? 'Top rated'
                    : section === 'Watchlist' ? 'Watchlist'
                      : section === 'Watched' ? 'Completed'
                        : section === 'Similar' ? `Similar to ${similarSource?.title || similarSource?.name || 'this title'}`
                          : 'Trending this week'}
              </h2>
            </div>
            <div className="catalog-heading-actions">
              {section === 'Home' && !query && <span className="hot-chip">HOT</span>}
              <span className="result-count">{visibleMovies.length} TITLES</span>
              {section === 'Similar' && (
                <button className="back-home-button" onClick={() => goToSection('Home')}>
                  Back to Home
                </button>
              )}
            </div>
          </div>
          {loading && <PosterSkeletons count={12} />}
          {!loading && error && <div className="status-message error"><strong>Catalogue unavailable</strong><span>{error}</span>{!token && <span>Copy <code>.env.example</code> to <code>.env</code> and add your TMDB Read Access Token, then restart the dev server.</span>}</div>}
          {cloudError && <div className="status-message error"><strong>Cloud sync notice</strong><span>{cloudError}</span></div>}
          {!authReady && <div className="status-message">Checking account…</div>}
          {!loading && !error && visibleMovies.length === 0 && <div className="status-message">{section === 'Watchlist' && !query ? 'Your collection is empty. Open a title and add it to Plan to Watch to save it here.' : section === 'Watched' && !query ? 'No completed titles yet. Mark a title as completed when you finish it.' : section === 'Similar' ? 'No similar titles were found for this selection.' : 'No titles found. Try another search.'}</div>}
          {!loading && <div className="movie-grid">{visibleMovies.map((movie) => <PosterCard key={`${movie.media_type || 'movie'}-${movie.id}`} movie={movie} onSelect={openDetails} showMoreDetails={Boolean(query.trim())} />)}</div>}
          {section !== 'Search' && query.trim() && !loading && visibleMovies.length > 0 && searchPage < searchTotalPages && (
            <div className="search-load-more">
              <button className="search-load-more-button" onClick={loadMoreSearchResults} disabled={searchLoadingMore}>
                {searchLoadingMore ? 'Loading…' : 'Load more results'}
              </button>
            </div>
          )}
        </section>
        {section === 'Discover' && !query && tvRecommendations.length > 0 && <section className="catalog-section recommendation-section">
          <div className="section-heading"><div><span className="eyebrow">SERIES WORTH YOUR TIME</span><h2>Trending TV shows</h2></div><span className="result-count">UPDATED WEEKLY</span></div>
          <div className="movie-grid">{tvRecommendations.slice(0, 12).map((show) => <PosterCard key={`tv-${show.id}`} movie={show} onSelect={openDetails} />)}</div>
        </section>}
        </>}
        </div>
        <footer className="footer-note">MOOVIE WEB <span>•</span> BUILT FOR THE LOVE OF FILM</footer>
      </main>

      {selected && <div className="detail-page-backdrop">
        <section ref={detailPageRef} className="detail-page" aria-label={`${selected.title || selected.name} details`}>
          <div className="detail-page-top">
            <button className="detail-back-button" onClick={closeDetails}>
              <span aria-hidden="true">←</span> Back to browsing
            </button>
            <button className="detail-page-close" onClick={closeDetails} aria-label="Close details"><X size={19} /></button>
          </div>

          <div className="detail-page-hero">
            {selected.backdrop_path && <img className="detail-backdrop-image" src={IMAGE_ROOT + 'w1280' + selected.backdrop_path} alt="" />}
            <div className="detail-page-hero-shade" />
            <div className="detail-page-hero-content">
              <div className="detail-page-poster">
                {selected.poster_path ? <img src={IMAGE_ROOT + 'w500' + selected.poster_path} alt={`${selected.title || selected.name} poster`} /> : <div className="detail-page-poster-fallback"><Film size={30} /></div>}
              </div>
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
                <button className={`detail-watch-button ${isSaved?'saved':''}`} onClick={()=>toggleWatchlist(selected)}>
                  {isSaved?<BookmarkCheck size={17}/>:<Bookmark size={17}/>}
                  {isSaved?'Remove from Watchlist':'Add to Watchlist'}
                </button>
                <label className="detail-status-select"><span>COLLECTION STATUS</span><select value={selectedWatchlistItem?.status||'plan_to_watch'} onChange={(event)=>setWatchStatus(selected,event.target.value)}><option value="plan_to_watch">Plan to Watch</option><option value="watching">Watching</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label>
                <button className={`detail-watch-button ${isWatched ? 'saved' : ''}`} onClick={() => toggleWatched(selected)}>
                  <CheckCircle2 size={17} /> {isWatched ? 'Mark as Not Completed' : 'Mark as Completed'}
                </button>
                <button className="detail-watch-button" onClick={findTrailer} disabled={trailerLoading}>
                  <Play size={16} fill="currentColor" /> {trailerLoading ? 'Finding Trailer…' : 'Find Trailer'}
                </button>
              </div>
            </div>
            </div>
          </div>

          <div className="detail-page-body">
            <nav className="detail-tabs" aria-label="Title information">
              <button className={detailTab === 'overview' ? 'active' : ''} onClick={() => setDetailTab('overview')}>Overview</button>
              <button className={detailTab === 'cast' ? 'active' : ''} onClick={() => setDetailTab('cast')}>Cast</button>
              <button className={detailTab === 'trailers' ? 'active' : ''} onClick={() => setDetailTab('trailers')}>Trailers</button>
            </nav>

            {detailTab === 'overview' && detailLoading && (
              <div className="detail-overview-skeleton" aria-label="Loading title information" aria-busy="true">
                <div className="detail-skeleton-story"><span className="eyebrow">THE STORY</span><i /><i /><i /><i className="short" /></div>
                <div className="detail-skeleton-facts"><i /><i /><i /></div>
              </div>
            )}

            {detailTab === 'overview' && !detailLoading && (
              <div className="detail-overview-panel">
                <div>
                  <span className="eyebrow">THE STORY</span>
                  <p className="detail-overview">{selected.overview || 'No overview is available for this title yet.'}</p>
                </div>
                <div className="detail-facts">
                  {selected.genres?.length > 0 && <div><span>GENRES</span><strong>{selected.genres.map((genre) => genre.name).join(' · ')}</strong></div>}
                  <div className="detail-user-rating"><span>YOUR MOOVIE RATING</span><div className="detail-rating-stars">{[1,2,3,4,5,6].map((value) => <button key={value} className={Number(ratings[getDocId(selected)]) >= value ? 'active' : ''} onClick={() => saveRating(selected, value)} aria-label={`Rate ${value} out of 6 stars`}><Star size={18} fill="currentColor" /></button>)}</div><strong>{ratings[getDocId(selected)] ? `${ratings[getDocId(selected)]}/6 stars` : 'Not rated yet'}</strong></div>
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

            <section className="detail-recommendations">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">KEEP EXPLORING</span>
                  <h2>More Like This</h2>
                </div>
                <span className="result-count">{detailRecommendations.length ? `${detailRecommendations.length} PICKS` : 'RECOMMENDED'}</span>
              </div>
              {detailRecommendations.length ? (
                <div className="poster-row-scroll">
                  {detailRecommendations.map((movie) => (
                    <div className="poster-row-item" key={`${movie.media_type}-${movie.id}`}>
                      <PosterCard movie={movie} onSelect={openDetails} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="detail-empty">{detailLoading ? 'Finding similar titles…' : 'No similar titles are available for this one yet.'}</p>
              )}
            </section>
          </div>
        </section>
      </div>}

      {providerPrompt && <div className="modal-backdrop provider-backdrop" role="dialog" aria-modal="true" aria-labelledby="provider-prompt-title" onClick={() => setProviderPrompt(null)}>
        <section className="provider-modal" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setProviderPrompt(null)} aria-label="Cancel"><X size={20} /></button>
          <span className="eyebrow">CHOOSE A PLAYER</span>
          <h2 id="provider-prompt-title">{providerPrompt.title || providerPrompt.name || 'This title'}</h2>
          <p className="provider-modal-copy">
            Pick the server to start with. Moovie remembers it for this {providerPrompt.media_type === 'tv' ? 'series' : 'film'} only, and you can switch anytime from the player.
          </p>
          <div className="provider-choices">
            {PLAYER_PROVIDERS.map((provider, index) => (
              <button key={provider.id} type="button" autoFocus={index === 0} onClick={() => chooseInitialProvider(provider.id)}>
                <strong>{provider.label}</strong>
                <span>{provider.id === 'vidstuck' ? 'ORIGINAL SOURCE' : 'ALTERNATIVE SOURCE'}</span>
              </button>
            ))}
          </div>
          <button className="provider-cancel" type="button" onClick={() => setProviderPrompt(null)}>Not now</button>
        </section>
      </div>}

      {ratingPrompt && <div className="rating-prompt-backdrop" role="dialog" aria-modal="true" aria-label="Rate completed title">
        <section className="rating-prompt-card">
          <span className="eyebrow">YOU FINISHED WATCHING</span>
          <h2>How would you rate it?</h2>
          <p>{ratingPrompt.title || ratingPrompt.name}</p>
          <div className="rating-prompt-stars">{[1,2,3,4,5,6].map((value) => <button key={value} onClick={() => saveRating(ratingPrompt, value)} aria-label={`Rate ${value} out of 6 stars`}><Star size={27} fill="currentColor" /> <span>{value}</span></button>)}</div>
          <button className="rating-prompt-skip" onClick={() => setRatingPrompt(null)}>Maybe later</button>
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
                <span>{selected.media_type === 'tv' ? `TV SERIES · SEASON ${playerSeason} · EPISODE ${playerEpisode}` : 'NOW PLAYING ON MOOVIE'}</span>
              </div>
            </div>
            {selected.media_type === 'tv' && (
              <div className="player-episode-selects">
                <label className="player-aspect-control"><span>SEASON</span>
                  <select aria-label="Season" value={playerSeason}
                    onChange={(e) => { setPlayerSeason(Number(e.target.value)); setPlayerEpisode(1); }}>
                    {(playerSeasons.length ? playerSeasons : [{ season_number: playerSeason, episode_count: 0 }]).map((s) =>
                      <option key={s.season_number} value={s.season_number}>{s.season_number}</option>)}
                  </select>
                </label>
                <label className="player-aspect-control"><span>EPISODE</span>
                  <select aria-label="Episode" value={playerEpisode} disabled={!playerSeasons.length}
                    onChange={(e) => setPlayerEpisode(Number(e.target.value))}>
                    {Array.from({ length: (playerSeasons.find((s) => Number(s.season_number) === Number(playerSeason))?.episode_count) || 1 },
                      (_, i) => i + 1).map((ep) => <option key={ep} value={ep}>{ep}</option>)}
                  </select>
                </label>
              </div>
            )}
            <ProviderSwitch
              value={playerProvider}
              label={providerLabel}
              options={PLAYER_PROVIDERS}
              onChange={switchProvider}
            />
            <button className="player-close" onClick={closePlayer} aria-label="Close player"><X size={20} /></button>
          </header>
          <div className={`player-frame-wrap${playerAspectRatio === 'fill' ? ' player-frame-fill' : ''}`} ref={playerFrameWrapRef} style={playerAspectRatio === 'fill' ? { height: 'calc(100dvh - 150px)' } : { aspectRatio: playerAspectRatio }}>
            <iframe
              ref={playerFrameRef}
              key={playerSrc}
              className="player-frame"
              src={playerSrc}
              title={`Moovie player: ${selected.title || selected.name}`}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setPlayerFrameLoaded(true)}
            />
            {playerFrameSlow && !playerFrameLoaded && (
              <div className="player-frame-notice" role="status">
                <strong>{providerLabel} is not responding.</strong>
                <p>It may be slow, or it may refuse to load inside another page. Only open this in a new tab if you are comfortable with that player on its own site.</p>
                <div className="player-notice-actions">
                  <a href={playerSrc} target="_blank" rel="noreferrer noopener">Open in a new tab</a>
                  {playerProvider !== 'vidstuck' && (
                    <button type="button" onClick={() => switchProvider('vidstuck')}>Switch back to Vidstuck</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="player-footer">
            <span>MOOVIE PLAYER</span>
            <a className="player-source-link" href={playerSrc} target="_blank" rel="noreferrer noopener">OPEN IN NEW TAB ↗</a>
            <label className="player-aspect-control">
              <span>ASPECT</span>
              <select aria-label="Player aspect ratio" value={playerAspectRatio} onChange={(event) => setPlayerAspectRatio(event.target.value)}>
                <option value="16 / 9">16:9</option>
                <option value="4 / 3">4:3</option>
                <option value="21 / 9">21:9</option>
                <option value="1 / 1">1:1</option>
                <option value="fill">FILL SCREEN</option>
              </select>
            </label>
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
