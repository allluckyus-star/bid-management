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

## 3. Production deploy (Netlify or Vercel)

**Netlify** (monorepo at repo root):

1. Base directory: `job-bid-history-manager`
2. Build command: `npm run build:web`
3. Enable **Next.js** runtime (`@netlify/plugin-nextjs`); leave publish directory empty (see root `netlify.toml`).
4. Set the same env vars as `.env.example` (`APP_BASE_URL` = your live URL, no trailing slash).

**Vercel:** import repo; root **`apps/web`** or monorepo `npm run build:web`.

After deploy:

1. Extension **production API** in `apps/extension/config.js` → `PRODUCTION_URL` (or Settings → Production in the extension).
2. Supabase **Authentication → URL configuration**: Site URL + `https://YOUR-SITE/**` and `http://localhost:3000/**` for dev.

Example production URL: `https://velvety-naiad-90a2b9.netlify.app`

## 4. Chrome extension

- Reload unpacked `apps/extension`
- Web app URL = production URL
- Capture token from dashboard Extension page
