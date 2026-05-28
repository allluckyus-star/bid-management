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

Deploy: [docs/PRE-DEPLOY.md](../../docs/PRE-DEPLOY.md).
