# Chrome extension (v0.5.0)

Captures **`document.body.innerText` only** (no HTML) and POSTs to the web app:

`POST {apiBaseUrl}/api/capture/job`  
Header: `Authorization: Bearer jbhm_…`

Identity (`captured_by`) is resolved on the server from the token owner’s profile — not sent from the extension.

## Setup (once)

1. Sign in → Dashboard → **Extension** → **Create capture token** (copy once).
2. Extension **Settings** (right-click extension → Options, or popup → Settings):
   - Paste **Capture token**
   - **Test connection** — should show “Connected as …”
3. Load unpacked from this folder in `chrome://extensions` (Reload after code changes).

Default API: `https://bid-management-peach.vercel.app`. Developers can switch to **Localhost** in Settings only.

## Capture

- Popup → **Capture this page**
- Right-click on a page → **Capture this page to Job Bid History**
- Requires visible text on the page (~80+ chars enforced server-side)

## Popup

- Connection status (from `GET /api/extension/me`)
- **Open Dashboard** / **Settings**
- No URL or `captured_by` fields on the popup
