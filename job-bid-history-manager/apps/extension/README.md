# Chrome extension (v0.8.42)

The extension is a **right-side workspace panel only** (Jobright-style). There is **no popup**.

## AI: direct Groq (hidden key pool)

Job extraction and resume generation call **Groq directly from the extension** — not through your JBHM server.

- Up to **3 API keys** rotate randomly per request (with automatic fallback on rate limits).
- Keys live in `groq-keys.local.js` (gitignored). **No UI** — users never see or manage keys.
- Setup (developer only):

```bash
cp apps/extension/groq-keys.local.example.js apps/extension/groq-keys.local.js
# Edit groq-keys.local.js — paste up to 3 gsk_… keys
```

Reload the unpacked extension after editing keys.

### What still uses the server

| Action | Route |
|--------|-------|
| Test connection | `GET /api/extension/me` |
| Validate username | `POST /api/extension/validate-username` |
| Save accepted bid | `POST /api/capture/job` |
| DOCX build (stateless) | Team render-docx API |
| .docx/.pdf text parse (stateless) | `POST /api/extension/extract-doc` |

## UX

1. **Toolbar icon** → toggles the right-side workspace on the active tab
2. **Context menu** → open workspace or capture shortcuts
3. **Options page** (right-click extension → Options): token, username, environment

## Workspace tabs

| Tab | Purpose |
|-----|---------|
| **JD Source** | Page extract, selection, manual paste — stored **locally only** |
| **Resume** | Paste/import resume text — stored **locally only** |
| **Prompt** | Editable template + locked suffix; builds prompt from local JD + resume |
| **Preview** | AI/heuristic result, manual edit, **Accept & send to dashboard** |
| **Settings** | Token, username validation, environment, connection status |

Footer: **Preview**, **ChatGPT**, **DOCX**.

## Core flow

1. Capture or paste JD locally (JD Source tab)
2. Paste resume locally (Resume tab)
3. Generate prompt (Prompt tab) → send to ChatGPT
4. Review/edit result (Preview tab)
5. **Accept & send to dashboard** — only then `POST /api/capture/job` with `client_reviewed: true`

Server stores **final accepted result only** — not raw resume text or JD drafts.

## Setup (once)

1. Sign in to web dashboard.
2. Register your username in dashboard settings.
3. Create a capture token (dashboard settings / extension setup page if bookmarked).
4. Extension **Settings** tab or Options page:
   - paste capture token
   - enter username
   - validate username
   - test connection
5. On a job listing page, click the extension icon — workspace opens immediately.

Default API: `https://velvety-naiad-90a2b9.netlify.app`  
Developers may switch to localhost in the workspace **Settings** tab or Options page.

## Free-tier safe mode

See [docs/FREE-TIER-SAFETY.md](../../docs/FREE-TIER-SAFETY.md).

- Local JD/resume/prompt drafts in `chrome.storage.local`
- Preview-before-save workflow
- Server capture defaults to client-reviewed (no Groq on save)

## Known limitations

- Workspace injection is blocked on browser internal pages (`chrome://`, etc.).
- ChatGPT automation requires an open ChatGPT tab.
