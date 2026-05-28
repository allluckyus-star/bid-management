# Job Bid History — Web (`apps/web`)

Next.js App Router + Supabase (shared team board) + Groq extraction in API routes.

## Setup

1. Supabase project + migrations in `supabase/migrations/` (including username/extension migrations through latest).
2. `.env.example` → `.env.local` (see [docs/PRE-DEPLOY.md](../../docs/PRE-DEPLOY.md)).
3. From repo root: `npm install` then `npm run dev`.

## Routes

| Path | Purpose |
|------|---------|
| `/dashboard` | Jobs table, filters, timeline chart |
| `/dashboard/extension` | Chrome capture tokens |
| `/api/profile/username` | Register/get account username for capture identity |
| `/api/extension/validate-username` | Validate username against capture token owner |
| `/api/capture/job` | Extension capture (Bearer token) |

## Extension identity setup

1. Sign in with your account.
2. Register your username in dashboard settings.
3. Create capture token on Extension page.
4. In extension settings: paste token, enter same username, validate username.
5. Capture jobs.

Capture rejects requests when:
- username is missing
- username is unregistered for token owner
- username belongs to another account
- token is invalid/revoked

## Scripts (repo root)

- `npm run dev` — development
- `npm run build:web` — production build

## Vercel / capture performance

On **Vercel Hobby**, keep serverless capture routes light:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SYNC_CAPTURE_EXTRACTION` | `false` | When false, `/api/capture/job` uses heuristic extraction only (no Groq call). |
| `ENABLE_REALTIME_INVALIDATION` | `false` | When false, skips Supabase realtime broadcast during capture. |
| `GROQ_MAX_CAPTURE_CHARS` | `10000` | Caps text sent to Groq when sync extraction is enabled. |

Extension sends at most **30,000** characters of visible text per capture. Set `SYNC_CAPTURE_EXTRACTION=true` only when you explicitly need AI fields filled during capture.

## Free-tier safe mode (client)

Set `NEXT_PUBLIC_FREE_TIER_SAFE_MODE=true` (default) to disable dashboard background polling and show a manual **Refresh** bar. Pair with extension review-first capture.

Full checklist: [docs/FREE-TIER-SAFETY.md](../../docs/FREE-TIER-SAFETY.md).

Deploy: [docs/PRE-DEPLOY.md](../../docs/PRE-DEPLOY.md).
