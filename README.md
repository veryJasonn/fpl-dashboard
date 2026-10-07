# FPL Mini-League Dashboard

Vite + React frontend with a Vercel serverless function that proxies the
Fantasy Premier League API (to work around its CORS restrictions).

- `src/App.jsx` — fetches `/api/leagues-classic/{id}/standings` and renders a table.
- `api/leagues-classic/[id]/standings.js` — proxies to
  `https://fantasy.premierleague.com/api/leagues-classic/{id}/standings/`.

## Running locally

The frontend (Vite) and the API routes (`/api`) need to run together, so use
the Vercel CLI's dev server rather than plain `vite`.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install the Vercel CLI (one-time, globally):

   ```bash
   npm install -g vercel
   ```

3. Start the dev server (serves the Vite app and the `/api` functions on one port):

   ```bash
   vercel dev
   ```

   First run will ask to link/create a Vercel project — you can choose "no"
   to link and just develop locally, or link it if you plan to deploy.

4. Open the printed local URL (typically `http://localhost:3000`).

## Deploying

Push this folder to a git repo and import it in Vercel, or run:

```bash
vercel
```

No environment variables are required — the league ID (`1187651`) is
currently hardcoded in `src/App.jsx` as `LEAGUE_ID`.
