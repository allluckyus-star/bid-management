# Web migration (Next.js + Supabase + Vercel)

## Locked decisions

- **Shared team board** — RLS allows all `authenticated` users to read/write jobs (see `apps/web/supabase/migrations/001_jbhm_shared_team.sql`).
- **Capture** — Chrome extension will send **`innerText` only** (Phase 2); stored as `job_descriptions.raw_text`.
- **Groq** — Model `llama-3.1-8b-instant`; API key only in Vercel/server env; Route Handlers call Groq cloud API.
- **Layout** — `apps/web` (this repo), not a separate gateway/Tauri deploy.

## Groq FAQ

| Question | Answer |
|----------|--------|
| Is Groq on Vercel? | No. Vercel runs Next.js; your `/api/*` code calls Groq’s API. |
| Where is `GROQ_API_KEY`? | Vercel env vars + local `apps/web/.env.local` (never `NEXT_PUBLIC_`). |
| Does the extension call Groq? | No. Extension → your HTTPS `/api/capture/job` → server calls Groq. |

## Phase status

| Phase | Status |
|-------|--------|
| 1 — Supabase schema + auth + jobs list | **Done** |
| 2 — Extension capture + tokens | **Done** |
| 3 — Groq extraction | **Done** (fallback mock) |
| 4 — Full table edit/tags/notes | **Done** (dashboard UI) |
| 5 — Resumes (Storage) | **Done** (needs `002_storage_resumes.sql`) |
| 6 — Timeline chart | **Done** |
| 7 — Vercel deploy | **Ready** — see `docs/PRE-DEPLOY.md` |

## Deprecate (after parity)

- `jbhm-gateway.exe`, port 4832, LAN host API
- `apps/desktop` Tauri client as primary UI
- `apps/api` FastAPI + SQLite for production
