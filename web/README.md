# Moovie Web

Moovie is a React + Vite movie and TV discovery app. The web frontend is maintained separately from the Android application.

## Features

- Discover trending and top-rated movies and TV series.
- Browse titles by genre and mood.
- Search movies and TV shows, filter by release year and country, and sort results.
- Open title details, including overview, cast, trailers, ratings, and similar titles.
- Manage a watchlist with Plan to Watch, Watching, Completed, and Dropped statuses.
- Track playback progress and continue watching.
- Rate titles on a six-star scale.
- View profile activity and collection statistics.
- Sign in with Google or email/password using Firebase Authentication.
- Sync account collection data with Cloud Firestore; guest data is stored locally in the browser.
- Watchlist changes apply instantly and are queued while offline, then synced when the connection returns.
- Customize the app accent with appearance themes in Settings.
- Responsive layout and PWA installation support, with an offline app shell.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- TMDB API Read Access Token
- Firebase project configuration for authentication and cloud sync

## Run locally

From the repository root:

```bash
cd web
npm install
```

Create a local `.env` file by copying `.env.example`:

```bash
cp .env.example .env
```

Set your TMDB Read Access Token:

```env
VITE_TMDB_READ_TOKEN=your_tmdb_read_access_token_here
```

For Firebase sign-in and cloud sync, add your Firebase web app configuration to the same `.env` file:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

Enable the required sign-in providers in Firebase Authentication and configure Firestore for your project.

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Vite. Restart the dev server after changing environment variables.

## Configuration

Vite inlines every `VITE_*` variable into the client bundle at build time, so **anything in `.env` is public**.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_TMDB_READ_TOKEN` | yes | TMDB Read Access Token. Without it no titles load. |
| `VITE_FIREBASE_API_KEY` | yes | Firebase web app config (console → Project settings → General → Your apps). |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | » |
| `VITE_FIREBASE_PROJECT_ID` | yes | » |
| `VITE_FIREBASE_STORAGE_BUCKET` | no | » |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | no | » |
| `VITE_FIREBASE_APP_ID` | yes | » |

If the required Firebase values are missing, the app shows a "Firebase isn't configured" screen listing the missing variable names instead of a blank page (`src/firebase.js`, `src/main.jsx`).

Add every domain you deploy to under **Firebase console → Authentication → Settings → Authorized domains**, otherwise Google sign-in fails with `auth/unauthorized-domain`.

## Build and preview

```bash
npm run build
npm run preview
```

The production output is written to `dist/`.

## Deployment

The web app is published by `.github/workflows/pages.yml` to GitHub Pages:

| Path | Content |
| --- | --- |
| `/` | Static download landing page (repo root `index.html`) |
| `/app/` | This app, built with `--base=/app/` |
| `/404.html` | A copy of the app shell, so a hard refresh on a deep link such as `/app/title/movie-550` boots the app instead of returning a 404 |

Add the seven `VITE_*` variables above as repository secrets (Settings → Secrets and variables → Actions) so the deploy build has them.

If you host elsewhere, keep the same split: build with an explicit `--base=<path>` and serve a copy of the built `index.html` as the 404 document (Netlify: `_redirects` with `/* /index.html 200`; S3/CloudFront: the 403/404 error document).

## PWA

The app includes a manifest, install icon, and service worker for app-shell and same-origin static-asset caching. Installation is supported on HTTPS deployments and localhost.

`public/manifest.webmanifest`, `public/moovie-icon.svg`, and `public/sw.js` are copied to the build output verbatim. **Keep them in `public/`**: when they lived next to `index.html`, Vite content-hashed them into `assets/`, which broke the manifest URLs and made the service worker's precache list 404, so the worker never installed.

The service worker precaches the shell, serves navigations network-first with a cached fallback, and serves hashed assets cache-first. Bump the cache name in `public/sw.js` whenever the precache list changes.

## Security

- Never commit `.env` or real credentials.
- Variables prefixed with `VITE_` are included in browser-side code. Treat the TMDB token and Firebase web configuration as client-visible; do not place private server credentials in them.
- Restrict and monitor API usage in provider dashboards. For public deployment, consider a server-side proxy for TMDB requests if you need to protect a token or enforce usage limits.
- Configure Firebase Authentication and Firestore security rules before deploying.

## Project structure

```text
web/
├── public/            # Static assets and PWA files (manifest, icon, service worker)
├── src/
│   ├── App.jsx        # App UI, routes, and feature logic
│   ├── firebase.js    # Firebase initialization and config validation
│   ├── useWatchlist.js # Watchlist state, cloud sync, and mutations
│   ├── library.js     # Watchlist/ratings document shape and local backups
│   ├── messages.js    # Shared user-facing error messages
│   └── *.css          # App, authentication, and player styles
├── .env.example       # Environment variable template
├── index.html
├── package.json
└── vite.config.js
```
