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
- Customize the app accent with appearance themes in Settings.
- Responsive layout and PWA installation support.

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

## Build and preview

```bash
npm run build
npm run preview
```

The production output is written to `dist/`.

## PWA

The app includes a manifest, install icon, and service worker for app-shell and same-origin static-asset caching. Installation is supported on HTTPS deployments and localhost.

## Security

- Never commit `.env` or real credentials.
- Variables prefixed with `VITE_` are included in browser-side code. Treat the TMDB token and Firebase web configuration as client-visible; do not place private server credentials in them.
- Restrict and monitor API usage in provider dashboards. For public deployment, consider a server-side proxy for TMDB requests if you need to protect a token or enforce usage limits.
- Configure Firebase Authentication and Firestore security rules before deploying.

## Project structure

```text
web/
├── public/          # Static assets and PWA files
├── src/
│   ├── App.jsx      # App UI, routes, and feature logic
│   ├── firebase.js  # Firebase initialization
│   └── *.css        # App, authentication, and player styles
├── .env.example     # Environment variable template
├── index.html
├── package.json
└── vite.config.js
```
