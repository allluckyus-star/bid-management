# Chrome extension (v0.4.0)

Captures **`document.body.innerText` only** (no HTML) and POSTs to the web app:

`POST {apiBaseUrl}/api/capture/job`  
Header: `Authorization: Bearer jbhm_…`

## Setup

1. Run the web app (`npm run dev:web`) or use your Vercel URL.
2. Sign in → Dashboard → **Extension** → **Create capture token** (copy once).
3. Extension popup:
   - **Web app URL** — e.g. `http://localhost:3000`
   - **Capture token** — paste from dashboard
   - **Captured by** — display name on the shared board
4. Load unpacked extension from this folder in `chrome://extensions` (Reload after updates).

## Capture

- Toolbar button or right-click → **Capture job to Bid History**
- Requires ~80+ characters of visible text on the page
