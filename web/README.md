# Moovie Web

A lightweight React + Vite Progressive Web App for the Moovie project. This frontend lives separately from the existing Android application.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A TMDB API Read Access Token

## Run locally

1. Open a terminal in this `web/` directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and set `VITE_TMDB_READ_TOKEN` to your TMDB Read Access Token.
4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

The production build is written to `dist/`.

## PWA

The app includes a web app manifest, install icon, and a small service worker that caches the app shell and same-origin static assets. Install availability requires HTTPS (or localhost during development).

## Security

Never commit `.env` or a real TMDB token. Vite exposes variables prefixed with `VITE_` to browser code, so a TMDB token embedded this way is visible to users. For a public production deployment, use a restricted TMDB key/token and consider a small server-side proxy before adding private credentials.

## Current scope

- Trending movie feed
- Top-rated discovery feed
- Search for movies and TV
- Basic title details
- Responsive desktop/mobile layout
- PWA installation foundation

Watchlist sync, authentication, recommendations, playback, and social features are not connected yet.
