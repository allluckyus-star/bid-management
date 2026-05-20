# Job Bid History — Chrome Extension (MV3)

Captures **visible page text only** via `document.body.innerText` and sends it to the local FastAPI backend.

## Install (unpacked)

1. Start the API: `npm run dev:api` from monorepo root.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this folder: `apps/extension`
5. Open the extension popup:
   - Set **Captured by** (your name)
   - Set **API base URL** (default `http://127.0.0.1:5123`)
   - Click **Save settings**

## Capture a job

- Open a job posting page
- Click extension icon → **Capture this page**, or
- Right-click → **Capture job to Bid History**

Success/failure appears in the popup status line and Chrome notifications.

## Security

- Does not send HTML, CSS, JavaScript, or `outerHTML`
- Only plain text from `document.body.innerText`
