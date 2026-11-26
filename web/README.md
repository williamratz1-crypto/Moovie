# Moovie Web

A React + Vite Progressive Web App for the Moovie project. This frontend lives
separately from the Android application and shares the same Firebase project.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A TMDB API Read Access Token
- A Firebase project (for accounts and cloud sync)

## Run locally

1. Open a terminal in this `web/` directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill it in (see [Configuration](#configuration)).
4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL printed by Vite.

## Configuration

Vite inlines every `VITE_*` variable into the client bundle at build time, so
**anything in `.env` is public**. Never put a secret in it.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_TMDB_READ_TOKEN` | yes | TMDB Read Access Token (the long JWT-style token from <https://www.themoviedb.org/settings/api>). Without it no titles load. |
| `VITE_FIREBASE_API_KEY` | yes | Firebase web app config — Firebase console → Project settings → General → Your apps. |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | » |
| `VITE_FIREBASE_PROJECT_ID` | yes | » |
| `VITE_FIREBASE_STORAGE_BUCKET` | no | » |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | no | » |
| `VITE_FIREBASE_APP_ID` | yes | » |

If the four required Firebase values are missing, the app renders a
"Firebase isn't configured" notice listing the missing names instead of
crashing (see `src/firebase.js` and `src/main.jsx`).

Also add every domain you deploy to under **Firebase console → Authentication →
Settings → Authorized domains**, otherwise Google sign-in fails with
`auth/unauthorized-domain`.

## Production build

```bash
npm run build
npm run preview
```

The production build is written to `dist/`.

## Deployment

The web app is published by `.github/workflows/pages.yml` to GitHub Pages:

- `/` — the static download landing page (repo root `index.html`)
- `/app/` — this app, built with `--base=/app/`
- `/404.html` — a copy of the app shell, so a hard refresh on a deep link such as
  `/app/title/movie-550` boots the app instead of returning a 404.

Add these repository secrets for the build (Settings → Secrets and variables →
Actions): `VITE_TMDB_READ_TOKEN`, `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_APP_ID`.

If you host elsewhere, the only requirement is the same split — the app must be
built with an explicit `--base=<path>` and a `404.html` copy of the built
`index.html` must be served for unknown paths (Netlify: `_redirects` with
`/* /index.html 200`; S3/CloudFront: the 403/404 error document).

## PWA

`public/manifest.webmanifest`, `public/moovie-icon.svg` and `public/sw.js` are
copied to the build output verbatim. **Keep them in `public/`**: when they lived
in `src/`-adjacent paths, Vite content-hashed them into `assets/`, which broke
the manifest URLs *and* made the service worker's `cache.addAll()` reject — so
the worker silently never installed.

The service worker precaches the shell, serves navigations network-first with a
cached fallback, and serves hashed assets cache-first. Install availability
requires HTTPS (or localhost during development).

## Security

Never commit `.env` or a real TMDB token. Vite exposes `VITE_*` variables to
browser code, so a TMDB token embedded this way is visible to users. For a public
production deployment, use a restricted TMDB key/token and consider a small
server-side proxy before adding private credentials.

## Implemented

- Trending / top-rated feeds, genre and mood discovery
- Search for movies and TV with filters and paging
- Title details: cast, trailer, ratings, similar titles
- Watchlist with statuses, guest mode, and Firestore cloud sync
- Six-star personal ratings, profile dashboard and stats
- Account management: email/password, Google sign-in, account deletion
- Playback via the provider embed, Continue Watching and progress tracking
- PWA install + offline shell
