import { useEffect, useMemo, useState } from 'react';
import { Search, Film, Compass, Bookmark, UserRound, Play, Star, X, Clapperboard, Sparkles } from 'lucide-react';

const API_ROOT = 'https://api.themoviedb.org/3';
const IMAGE_ROOT = 'https://image.tmdb.org/t/p/';
const token = import.meta.env.VITE_TMDB_READ_TOKEN;

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

function PosterCard({ movie, onSelect }) {
  const title = movie.title || movie.name || 'Untitled';
  return (
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
  );
}

export default function App() {
  const [section, setSection] = useState('Home');
  const [movies, setMovies] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const endpoint = section === 'Discover' ? '/movie/top_rated' : '/trending/movie/week';
    tmdb(endpoint)
      .then((data) => { if (alive) setMovies(data.results || []); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [section]);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      tmdb(`/search/multi?query=${encodeURIComponent(query.trim())}&include_adult=false`)
        .then((data) => { if (alive) setSearchResults((data.results || []).filter((item) => item.media_type !== 'person')); })
        .catch((err) => { if (alive) setError(err.message); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const visibleMovies = useMemo(() => query.trim() ? searchResults : movies, [query, searchResults, movies]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => { setSection('Home'); setQuery(''); }}>
          <span className="brand-mark"><Clapperboard size={21} /></span><span>moovie<span className="brand-dot">.</span></span>
        </a>
        <div className="side-label">MENU</div>
        <nav className="side-nav">
          <button className={section === 'Home' ? 'active' : ''} onClick={() => { setSection('Home'); setQuery(''); }}><Film /> Home</button>
          <button className={section === 'Discover' ? 'active' : ''} onClick={() => { setSection('Discover'); setQuery(''); }}><Compass /> Discover</button>
          <button onClick={() => setError('Watchlist sync is coming in a later milestone.')}><Bookmark /> Watchlist</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-chip"><div className="avatar">M</div><div><strong>Movie lover</strong><span>Guest account</span></div></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><Clapperboard size={20} /> moovie<span>.</span></div>
          <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies, series..." /><kbd>⌘ K</kbd></div>
          <button className="profile-button" aria-label="Profile"><UserRound size={19} /></button>
        </header>

        <section className="welcome-row">
          <div><p className="eyebrow"><Sparkles size={13} /> YOUR NEXT FAVOURITE IS HERE</p><h1>{query ? 'Search results' : section === 'Discover' ? 'Explore the good stuff.' : 'Find your next movie.'}</h1><p className="subheading">A universe of stories, one click away.</p></div>
        </section>

        {!query && <section className="hero-banner">
          <div className="hero-copy"><span className="hero-tag">THE MOOVIE COLLECTION</span><h2>Stories worth<br />staying up for.</h2><p>Find something unforgettable to watch tonight.</p><button className="hero-button" onClick={() => setSection('Discover')}>Explore titles <Play size={14} fill="currentColor" /></button></div>
          <div className="hero-art"><div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div><div className="art-film"><Clapperboard size={74} strokeWidth={1.1} /></div><span className="art-star star-a">✳</span><span className="art-star star-b">✦</span></div>
        </section>}

        <section className="catalog-section">
          <div className="section-heading"><div><span className="eyebrow">{query ? 'MATCHING TITLES' : section === 'Discover' ? 'CRITIC FAVOURITES' : 'UPDATED WEEKLY'}</span><h2>{query ? `Results for “${query}”` : section === 'Discover' ? 'Top rated' : 'Trending this week'}</h2></div><span className="result-count">{visibleMovies.length} TITLES</span></div>
          {loading && <div className="status-message">Loading the catalogue…</div>}
          {!loading && error && <div className="status-message error"><strong>Catalogue unavailable</strong><span>{error}</span>{!token && <span>Copy <code>.env.example</code> to <code>.env</code> and add your TMDB Read Access Token, then restart the dev server.</span>}</div>}
          {!loading && !error && visibleMovies.length === 0 && <div className="status-message">No titles found. Try another search.</div>}
          <div className="movie-grid">{visibleMovies.map((movie) => <PosterCard key={movie.id} movie={movie} onSelect={setSelected} />)}</div>
        </section>
        <footer className="footer-note">MOOVIE WEB <span>•</span> BUILT FOR THE LOVE OF FILM</footer>
      </main>

      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X /></button>
        {selected.backdrop_path && <img className="detail-backdrop" src={IMAGE_ROOT + 'w780' + selected.backdrop_path} alt="" />}
        <div className="detail-content"><span className="eyebrow">MOOVIE TITLE</span><h2>{selected.title || selected.name}</h2><p className="detail-meta">{(selected.release_date || selected.first_air_date || '').slice(0, 4)} <span>•</span> <Star size={13} fill="currentColor" /> {selected.vote_average?.toFixed(1) || 'Not rated'}</p><p>{selected.overview || 'No overview is available for this title yet.'}</p></div>
      </section></div>}
    </div>
  );
}