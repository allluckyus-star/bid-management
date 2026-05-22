# Pre-deploy checklist (`apps/web`)

## 1. Supabase

1. Create project at [supabase.com](https://supabase.com).
2. Run SQL in order:
   - `apps/web/supabase/migrations/001_jbhm_shared_team.sql`
   - `apps/web/supabase/migrations/002_storage_resumes.sql`
3. Auth → enable Email provider.
4. Copy API keys to `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
APP_CAPTURE_TOKEN_SECRET=<openssl rand -hex 32>
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
```

Use the **project URL only** — do not append `/rest/v1/`.

## 2. Local smoke test

```bash
npm install
npm run dev
```

- Sign up → http://localhost:3000/dashboard
- Extension page → create capture token → Chrome extension (v0.4)
- Capture a job page → row appears
- Edit cell, tags, notes, JD view, resume .docx, chart (Hour/Day/Month switches without extra API calls)

## 3. Vercel

1. Import repo; root directory **`apps/web`** (or monorepo build: `cd ../.. && npm run build:web`).
2. Set the same env vars (secrets without `NEXT_PUBLIC_` prefix where applicable).
3. Deploy → extension **Web app URL** = `https://your-app.vercel.app`
4. Supabase **Authentication → URL configuration**: Site URL + redirect URLs for production (and `http://localhost:3000/**` for dev).

## 4. Chrome extension

- Reload unpacked `apps/extension`
- Web app URL = production URL
- Capture token from dashboard Extension page
