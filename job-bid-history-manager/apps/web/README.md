# Job Bid History — Web (`apps/web`)

Next.js App Router + Supabase (shared team board) + Groq extraction in API routes.

## Setup

1. Supabase project + migrations `001` and `002` in `supabase/migrations/`.
2. `.env.example` → `.env.local` (see [docs/PRE-DEPLOY.md](../../docs/PRE-DEPLOY.md)).
3. From repo root: `npm install` then `npm run dev`.

## Routes

| Path | Purpose |
|------|---------|
| `/dashboard` | Jobs table, filters, timeline chart |
| `/dashboard/extension` | Chrome capture tokens |
| `/api/capture/job` | Extension capture (Bearer token) |

## Scripts (repo root)

- `npm run dev` — development
- `npm run build:web` — production build

Deploy: [docs/PRE-DEPLOY.md](../../docs/PRE-DEPLOY.md).
