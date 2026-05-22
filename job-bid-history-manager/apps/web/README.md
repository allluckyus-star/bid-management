# Job Bid History — Web (`apps/web`)

Next.js App Router + Supabase (shared team board). Replaces Tauri/gateway/LAN for production.

## Decisions (this migration)

| Topic | Choice |
|--------|--------|
| Data scope | **Shared team board** — any signed-in user sees all jobs |
| Capture (Phase 2+) | **`document.body.innerText` only** — no HTML in extension |
| Groq | **`llama-3.1-8b-instant`** — called from **Route Handlers**, not from browser |
| Repo | **`apps/web`** in this monorepo |

### Groq vs Vercel

- **Vercel** hosts your Next.js pages and `/api/*` routes.
- **Groq** hosts the LLM API. Your server code calls `https://api.groq.com` with `GROQ_API_KEY` (server env only).
- The key is **never** in the Chrome extension or `NEXT_PUBLIC_*` vars.

## Phase 1

- [x] Supabase starter in `apps/web`
- [x] SQL migration: `supabase/migrations/001_jbhm_shared_team.sql`
- [x] Auth (email/password from starter)
- [x] Dashboard + jobs list from Supabase

## Phase 2 (current)

- [x] `POST /api/capture/job` — Bearer capture token, innerText payload, mock extraction
- [x] `GET/POST /api/extension-tokens` — create/revoke tokens (dashboard)
- [x] Chrome extension v0.4.0 — innerText → `/api/capture/job`

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. Copy `.env.example` → `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_*`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role)
   - `APP_CAPTURE_TOKEN_SECRET` (long random string, e.g. `openssl rand -hex 32`)
3. In Supabase **SQL Editor**, run the full migration file `001_jbhm_shared_team.sql`.
4. Enable Email auth in Supabase if needed.
5. From repo root:

   ```bash
   npm install
   npm run build:shared
   npm run dev:web
   ```

6. Open http://localhost:3000 → sign up → **Dashboard** → **Create capture token**.
7. Chrome extension: set Web app URL, paste token, reload extension (v0.4.0).

## Scripts (from repo root)

- `npm run dev:web` — Next dev server (port 3000)
- `npm run build:web` — production build

## Next phases

- **Phase 3:** Groq extraction in Route Handlers (replace mock-heuristic)
- **Phase 4–6:** Full table UX, resumes, timeline chart
- **Phase 7:** Deploy to Vercel

Legacy stack (`apps/api`, `apps/desktop`, gateway) stays for reference until parity.
