# Moovie Web

Moovie is a React + Vite movie and TV discovery app. The web frontend is maintained separately from the Android application.

## Features

- Discover trending and top-rated movies and TV series.
- Browse titles by genre and mood.
- Search movies and TV shows, filter by release year and country, and sort results.
- Open title details, including overview, cast, trailers, ratings, and similar titles.
- Manage a watchlist with Plan to Watch, Watching, Completed, and Dropped statuses.
- Track playback progress and continue watching.
- Choose between two playback servers per title, remembered per title and switchable from inside the player.
- Rate titles on a six-star scale.
- View profile activity and collection statistics.
- Sign in with Google or email/password using Firebase Authentication.
- Sync account collection data with Cloud Firestore; guest data is stored locally in the browser.
- Watchlist changes apply instantly and are queued while offline, then synced when the connection returns.
- Customize the app accent with appearance themes in Settings.
- Responsive layout and PWA installation support, with an offline app shell.
- Keyboard shortcuts: `Cmd/Ctrl + K` focuses search, `Esc` closes the topmost overlay (or the player), `F` toggles fullscreen while playing.
- Shareable deep links: each section has a URL (`/discover`, `/watchlist`, …) and each title has one like `/title/movie-550` or `/title/tv-1399` (prefixed by the deploy base, so `/app/title/movie-550` on GitHub Pages).

## Playback

Titles stream through third-party players embedded in an iframe. The app does not proxy, host, or store the media itself, and it holds no provider API keys.

| Server | Embed URL |
| --- | --- |
| Vidstuck (default) | `https://vidstuck.cc/embed/movie/{id}`, `…/embed/tv/{id}/{season}/{episode}` |
| VidFast | `https://vidfast.vc/movie/{id}`, `…/tv/{id}/{season}/{episode}` |

**The server choice is per title.** The first time a title is played the app asks which server to use, before playback starts. The answer is stored against `{mediaType}-{tmdbId}`, so `movie-550` and `tv-550` are independent and so are two different films. Reopening a title starts with its saved server and does not ask again. Inside the player the header shows `SERVER: <NAME>` next to a **Switch Provider** button; picking the other server reloads the same title and episode and saves the new choice for that title only.

Storage follows the same split as the rest of the app: signed-in users write `users/{uid}/providerPrefs/{key}` to Firestore, guests keep one localStorage map (`moovie-provider-prefs-v1`). Unreadable or unknown values normalise to "no preference", which shows the chooser again rather than guessing.

**Resume behaviour after a switch.** The new server starts at 00:00. Neither provider has a verified, documented start-position parameter, so the app does not invent one. The position reached so far is still written before the switch, so Continue Watching stays accurate.

**Progress tracking.** Both servers are tracked. Vidstuck posts `VIDEO_PROGRESS` and VidFast posts `PLAYER_EVENT`; `readPlaybackEvent()` normalises both into the single `recordProgress` path, so the watchlist schema and Continue Watching are unchanged. Messages are accepted only from the two known origins *and* only from the frame the app mounted. Writes are throttled to one per 10 seconds, saved immediately on pause/ended, and flushed when the player closes, the episode changes, or the server is switched.

**Completion.** The rating prompt fires on an explicit `ended`, or at ≥95% with at least 90 seconds genuinely watched (seeks larger than 15 seconds are not counted), for a film or the final episode of a series, once per title per app session.

**Embedding caveats.** Whether a provider allows being framed is that provider's decision (`X-Frame-Options` / `frame-ancestors`). Browsers give no reliable signal when a frame is refused, so the player shows a best-effort "not responding" notice after 9 seconds with an "open in a new tab" link, and the server control stays reachable in the header. This repo sets no `frame-src` CSP; if you add one, it must allow both provider origins and their subresources.

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

## Firestore data model and rules

The app uses three per-user subcollections, all keyed `{mediaType}-{tmdbId}`:

| Path | Content |
| --- | --- |
| `users/{uid}/watchlist/{key}` | Saved title, status, watch progress |
| `users/{uid}/ratings/{key}` | Six-star rating |
| `users/{uid}/providerPrefs/{key}` | `provider`, `tmdbId`, `mediaType`, `updatedAt` |

`firestore.rules` lists each subcollection explicitly and denies everything else, so **a new collection needs a new rule before it will work**; a missing rule surfaces as `permission denied` in the app's cloud error banner. Deploy rules from the repository root:

```bash
firebase deploy --only firestore:rules
```

`tools/verify_rules.sh` exercises the rules against a live project — owner access, cross-user denial, and the write shapes the app actually sends:

```bash
FIREBASE_API_KEY=your_web_api_key ./tools/verify_rules.sh   # writes verify_results.txt
```

It signs up two anonymous users, so the Anonymous provider must be enabled in Firebase Authentication. The web app itself does not use anonymous sign-in.

## Security

- Never commit `.env` or real credentials.
- Variables prefixed with `VITE_` are included in browser-side code. Treat the TMDB token and Firebase web configuration as client-visible; do not place private server credentials in them.
- Restrict and monitor API usage in provider dashboards. For public deployment, consider a server-side proxy for TMDB requests if you need to protect a token or enforce usage limits.
- Configure Firebase Authentication and Firestore security rules before deploying.

## Known limitations

- One progress record per title: a series keeps only the current episode's position, with no per-episode history.
- The completion/rating prompt is remembered per title per app session, so reloading can prompt again for a finished title that was never rated.
- Switching servers does not resume at the saved position (see [Playback](#playback)).
- Provider origins are matched exactly (`https://vidstuck.cc`, `https://vidfast.vc`). If a provider starts posting from a subdomain, its progress messages are ignored until the allowlist is updated.
- CI only builds the app (`.github/workflows/web-ci.yml`); the player, its cross-origin messaging, and the server chooser have no automated tests and are verified manually in a browser.

## Project structure

```text
web/
├── public/            # Static assets and PWA files (manifest, icon, service worker)
├── src/
│   ├── App.jsx        # App UI, routes, and feature logic
│   ├── firebase.js    # Firebase initialization and config validation
│   ├── useWatchlist.js # Watchlist state, cloud sync, and mutations
│   ├── providerPrefs.js # Per-title playback-server preference (Firestore + guest localStorage)
│   ├── ProviderSwitch.jsx # Player header: active server + switch menu
│   ├── useReveal.js   # Scroll-reveal hook for the motion layer
│   ├── globalKeyboard.js # Cmd/Ctrl+K search focus and Escape overlay closing
│   ├── library.js     # Watchlist/ratings document shape and local backups
│   ├── messages.js    # Shared user-facing error messages
│   └── *.css          # App, authentication, and player styles
├── .env.example       # Environment variable template
├── index.html
├── package.json
└── vite.config.js
```
