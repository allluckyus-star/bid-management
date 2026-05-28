# Chrome extension (v0.7.6)

Captures **`document.body.innerText` only** (no HTML) and POSTs to the web app:

`POST {apiBaseUrl}/api/capture/job`  
Header: `Authorization: Bearer jbhm_…`

Identity is token-authenticated and username-validated on the server:
- token owner must be valid
- username is required
- username must match the token owner account
- server writes `captured_by` from the validated username (never trust extension payload)

## Setup (once)

1. Sign in to the web dashboard.
2. In dashboard settings, register your username (one username per account).
3. Dashboard → **Extension** → **Create capture token** (copy once).
2. Extension **Settings** (right-click extension → Options, or popup → Settings):
   - Paste **Capture token**
   - Enter your registered **Username**
   - Click **Validate username**
   - **Test connection** — should show “Connected as …”
4. Load unpacked from this folder in `chrome://extensions` (Reload after code changes).

Default API: `https://bid-management-peach.vercel.app`. Developers can switch to **Localhost** in Settings only.

## Capture

- Popup → **Capture this page**
- Right-click on a page → **Capture this page to Job Bid History**
- Requires visible text on the page (~80+ chars enforced server-side)
- Requires validated username in extension settings

## Rejection rules

- Missing username: rejected
- Username not registered for token owner account: rejected
- Username belonging to another account: rejected
- Invalid/revoked token: rejected

## Popup

- Connection status (from `GET /api/extension/me`)
- **Open Dashboard** / **Settings**
- No URL or `captured_by` fields on the popup
