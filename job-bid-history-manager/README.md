# Job Bid History Manager

Shared team job bid board: **Next.js + Supabase** web app and **Chrome extension** capture (`innerText` only). Groq extraction runs on the server (Vercel).

## Monorepo

```
job-bid-history-manager/
  apps/
    web/         # Next.js dashboard + API routes
    extension/   # Chrome MV3 extension
  packages/
    shared/      # Shared TypeScript types
  docs/
    PRE-DEPLOY.md
    WEB-MIGRATION.md
```

## Prerequisites

- **Node.js** 20+
- **Supabase** project (Postgres + Auth + Storage)
- **Groq API key** (optional — mock extraction fallback)

## Quick start

```bash
npm install
```

1. Supabase: run `apps/web/supabase/migrations/001_jbhm_shared_team.sql` then `002_storage_resumes.sql`.
2. Copy `apps/web/.env.example` → `apps/web/.env.local` and fill keys (see [docs/PRE-DEPLOY.md](docs/PRE-DEPLOY.md)).
3. Run the app:

```bash
npm run dev
```

Open http://localhost:3000 → sign in → **Dashboard**. Extension setup: **Extension** in the header or `/dashboard/extension`.

### Chrome extension

1. `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension`
2. **Web app URL** — e.g. `http://localhost:3000` (or your Vercel URL)
3. **Capture token** — create on the Extension page in the dashboard

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (`apps/web`, port 3000) |
| `npm run build:web` | Production build |
| `npm run generate:icons` | Regenerate extension/web icons from `logo.png` |

## Deploy

See [docs/PRE-DEPLOY.md](docs/PRE-DEPLOY.md) (Supabase env vars, Vercel `apps/web`, extension URL).

## Data

**Production data** lives in **Supabase** (jobs, tags, resumes, capture tokens). There is no local SQLite in this repo anymore.

If you still have rows in an old `apps/api/data/*.db` file from a previous install, export from SQLite manually or re-capture via the extension — there is no automatic migrator in-repo.

## License

Private / team use.
