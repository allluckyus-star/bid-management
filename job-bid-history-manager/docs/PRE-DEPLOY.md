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
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APP_CAPTURE_TOKEN_SECRET=<openssl rand -hex 32>
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
```

## 2. Local smoke test

```bash
npm install
npm run build:shared
npm run dev:web
```

- Sign up → http://localhost:3000/dashboard
- Create capture token → paste in Chrome extension (v0.4)
- Capture a job page → row appears
- Edit cell, tags, notes, JD view, resume .docx, chart

## 3. Vercel

1. Import repo; root directory **`apps/web`** (or monorepo with build command `cd ../.. && npm run build:web`).
2. Set the same env vars (no `NEXT_PUBLIC_` on secrets).
3. Deploy → extension **Web app URL** = `https://your-app.vercel.app`

## 4. Chrome extension

- Reload unpacked `apps/extension`
- Web app URL = production URL
- Capture token from dashboard
