# Chrome extension (v0.8.23)

The extension uses a 2-layer UX:

1. **Toolbar icon** → **popup launcher** (status + quick actions)
2. **Open Workspace** → right-side **workspace panel** on the current tab (Jobright-style split view)
3. **Options page** (right-click extension → Options): token, username, environment

## Core flow

Capture sends text only (no HTML) to web app:

`POST {apiBaseUrl}/api/capture/job`  
Header: `Authorization: Bearer jbhm_...`

Identity is enforced server-side:
- token owner must be valid
- username is required
- username must match token owner account
- server writes `captured_by` from validated username

Captured text is cleaned in the content script and capped at **30,000 characters** (`JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS`).

## Setup (once)

1. Sign in to web dashboard.
2. Register your username in dashboard settings.
3. Dashboard → Extension → create capture token.
4. Extension Options or workspace **Settings** tab:
   - paste capture token
   - enter username
   - validate username
   - test connection
5. On a job listing page, click the extension icon → **Open Workspace** (or use popup actions).

Default API: `https://bid-management-peach.vercel.app`  
Developers may switch to localhost in the workspace **Settings** tab or Options page.

## Popup launcher

Click the toolbar icon to open the popup:

- **Open Workspace** — toggle the right-side panel on the active tab
- **Capture This Page** — send visible text to the dashboard (duplicate same URL blocked for 30s unless confirmed)
- **ChatGPT Prompt** / **Download DOCX** — existing flows
- **Dashboard** / **Settings**
- Connection status (cached up to **5 minutes**; refreshes in background when stale)

Workspace cannot open on `chrome://`, `edge://`, `about:`, or extension internal pages.

## Workspace panel

Tabs (dashboard-aligned styling):
- **JD** — latest / history / manual JD source
- **Resume** — upload, default, remove library resumes
- **Settings** — token, username, environment, **Refresh status**
- **Prompt** — editable template + locked suffix preview

Footer quick actions: Capture job, ChatGPT prompt, Download DOCX.

## Free-tier safe mode (`FREE_TIER_SAFE_MODE: true` in `config.js`)

Recommended on **Vercel Hobby**:

| Layer | Behavior |
|-------|----------|
| **Capture tab** | Review-first: refresh page text locally, edit fields, **one** `POST /api/capture/job` on Save |
| **Prompt tab** | Generate/copy/send prompt **locally**; server prompt is optional |
| **Popup Capture** | Opens workspace (no instant POST) |
| **Status** | `/api/extension/me` cached 5 min; username validation cached 10 min (token fingerprint) |
| **Backend** | Validation + persistence only — no Groq on normal capture |

See [docs/FREE-TIER-SAFETY.md](../../docs/FREE-TIER-SAFETY.md).

## Performance / API usage

- Extension status (`/api/extension/me`) is cached for 5 minutes in `chrome.storage.local`.
- Username validation runs only from Settings (Validate / Refresh), token/username changes, or stale cache — not on every popup open.
- Server capture defaults to **client-reviewed** or **fast-heuristic** (no Groq) unless `SYNC_CAPTURE_EXTRACTION=true` on Vercel.

## Existing flows preserved

- Context-menu capture
- ChatGPT auto-send / result capture
- Resume DOCX download and subfolder handling
- Username/token validation

## Known limitations

- Workspace injection is blocked on browser internal pages.
- Some sites with rigid full-width layouts may look cramped when the panel is open.
