# Web stack (current)

The app is **web-only**:

| Piece | Role |
|--------|------|
| `apps/web` | Next.js UI + `/api/*` (Supabase + Groq) |
| `apps/extension` | Chrome capture → `POST /api/capture/job` |
| Supabase | Postgres, Auth, Storage (`resumes` bucket) |

## Removed (legacy)

The following were removed from the repo:

- `apps/api` — FastAPI + SQLite
- `apps/desktop` — Tauri + Vite LAN client
- `jbhm-gateway.exe` — local proxy on port 4832
- LAN / client installer docs and scripts

**Your Supabase data is unchanged** — only deprecated code and docs were deleted.

## Product choices

- **Shared team board** — all signed-in users see/edit jobs (RLS)
- **Capture** — `document.body.innerText` only (extension v0.4+)
- **Groq** — `llama-3.1-8b-instant` in Route Handlers (`GROQ_API_KEY`)

## Deploy path

1. [PRE-DEPLOY.md](./PRE-DEPLOY.md) — Supabase + local smoke test
2. Vercel — root `apps/web`, same env as `.env.local`
3. Extension — production web URL + capture token
