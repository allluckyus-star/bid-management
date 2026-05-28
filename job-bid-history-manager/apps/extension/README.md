# Chrome extension (v0.7.9)

The extension uses a 2-layer UX:

1. **Toolbar icon** → toggles the right-side **workspace panel** on the current tab (Jobright-style split view)
2. **Options page** (right-click extension → Options): token, username, environment

## Core flow

Capture sends text only (no HTML) to web app:

`POST {apiBaseUrl}/api/capture/job`  
Header: `Authorization: Bearer jbhm_...`

Identity is enforced server-side:
- token owner must be valid
- username is required
- username must match token owner account
- server writes `captured_by` from validated username

## Setup (once)

1. Sign in to web dashboard.
2. Register your username in dashboard settings.
3. Dashboard -> Extension -> create capture token.
4. Extension Options:
   - paste capture token
   - enter username
   - validate username
   - test connection
5. On a job listing page, click the extension icon to open the workspace panel.

Default API: `https://bid-management-peach.vercel.app`  
Developers may switch to localhost in the workspace **Settings** tab or Options page.

## Workspace panel

Click the extension icon on any normal web page (LinkedIn, Greenhouse, etc.) to open or close the panel on the right. The page content shifts left (`margin-right`) so both are visible.

Tabs (dashboard-aligned styling):
- **JD** — latest / history / manual JD source (same APIs as dashboard JD Source page)
- **Resume** — upload, default, remove library resumes
- **Settings** — token, username, environment
- **Prompt** — editable template + locked suffix preview

Footer quick actions:
- Capture job
- ChatGPT prompt
- Download DOCX

## Existing flows preserved

- Context-menu capture
- Popup capture/chatgpt/download actions
- ChatGPT auto-send / result capture
- Resume DOCX download and subfolder handling
- Username/token validation

## Known limitations

- Workspace injection is blocked on browser internal pages (`chrome://`, `edge://`, `about:`).
- Some sites with rigid full-width layouts may still look slightly cramped when the panel is open.

## Popup (legacy)

`popup.html` remains in the repo for debugging but is not wired to the toolbar icon. Use the workspace panel instead.
