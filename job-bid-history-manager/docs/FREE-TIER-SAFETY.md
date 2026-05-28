# Free-tier safety (Vercel Hobby)

Use this checklist when deploying on **Vercel Hobby** or any plan with tight **Fluid Active CPU** limits.

## Vercel environment variables

```env
SYNC_CAPTURE_EXTRACTION=false
ENABLE_REALTIME_INVALIDATION=false
GROQ_MAX_CAPTURE_CHARS=10000
NEXT_PUBLIC_FREE_TIER_SAFE_MODE=true
```

## Extension (`FREE_TIER_SAFE_MODE` in `config.js`)

- **Review-first capture** — Capture tab loads page text locally; **Save to Dashboard** is the only POST.
- **Local prompt** — Prompt tab generates ChatGPT text on-device (no `/api/.../chatgpt-prompt` unless you choose server prompt).
- **Status cache** — `/api/extension/me` at most every 5 minutes; username validation cache 10 minutes.
- **Capped payload** — 30,000 characters max (`MAX_CAPTURE_TEXT_CHARS`).
- **Duplicate guard** — Same URL blocked for 30 seconds (client + server).

## Dashboard (web)

- **No background polling** when `NEXT_PUBLIC_FREE_TIER_SAFE_MODE=true`.
- Use the **Refresh** bar after extension captures.
- Search debounce 300ms; filters persisted locally per team.

## What still runs on Vercel (required)

- Bearer token validation
- Username ↔ token owner validation
- Payload size limits
- DB insert for jobs + JD text

## What should NOT run on every capture

- Groq / sync AI extraction (`SYNC_CAPTURE_EXTRACTION`)
- Supabase realtime subscribe + broadcast (`ENABLE_REALTIME_INVALIDATION`)
- Repeated `/api/extension/me` from popup/panel

## Watch usage

Vercel → Project → **Usage** → **Fluid Active CPU**

If CPU is high with low invocation count, individual requests are too heavy — keep capture routes to validation + insert only.

## Optional: manual AI extraction

Per-job “Run AI extraction” on the dashboard is **not implemented yet** (TODO). Use `SYNC_CAPTURE_EXTRACTION=true` temporarily only when you need bulk server-side extraction.
