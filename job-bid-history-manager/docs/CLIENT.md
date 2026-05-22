# Teammate client (local proxy → host)

The **client** is a single program, **`jbhm-gateway.exe`**. It does not use WebView2 or a Tauri window (so Astrill **ASProxy64** cannot crash the UI process). It:

- Runs a **local HTTP proxy** on `http://127.0.0.1:4832` and forwards to the host API (port **5123**)
- Serves the UI in your **default browser** (Chrome works with Astrill on)
- Extracts the Chrome extension to `%LOCALAPPDATA%\com.jbhm.desktop.client\chrome-extension`

The host PC keeps using `npm run dev:api:lan` — no host `.exe` required while debugging.

## Build the client installer

From the repo root:

```bash
npm install
npm run build:client
```

Output:

| Artifact | Path |
|----------|------|
| Run without installer | `apps/desktop/client-bundle/jbhm-gateway.exe` + `www/` |
| NSIS installer (if `makensis` is on PATH) | `apps/desktop/client-bundle/Job Bid History Manager (Client)_0.1.0_x64-setup.exe` |

First Rust build can take several minutes.

## Host PC

```bash
npm run dev:api:lan
```

Allow inbound TCP **5123** on private networks. Note your LAN IP (e.g. `192.168.100.17`).

## Teammate PC

1. Install from the NSIS setup (or copy `client-bundle/` and run `jbhm-gateway.exe` next to the `www` folder).
2. Chrome opens `http://127.0.0.1:4832/` automatically.
3. **Host Server** defaults to `http://192.168.100.17:5123` (change in the UI if needed).
4. Click **Extension Folder** → Chrome → `chrome://extensions` → Developer mode → **Load unpacked**.
5. Extension popup: **API URL** `http://127.0.0.1:4832`, set **Captured by** name.

All UI and extension traffic goes to **localhost**, then forwards to the host over the LAN.

## Dev on your machine

```bash
npm run build:shared
npm run dev:client -w @jbhm/desktop
```

Builds the client UI, runs `jbhm-gateway` against `dist/`, opens the browser. Set `JBHM_CLIENT_CONSOLE=1` for a debug console (default in dev script).

## Requirements (teammate PC)

| Requirement | Notes |
|-------------|--------|
| **Windows 10/11** | 64-bit |
| **Chrome or Edge** | For the UI (WebView2 **not** required) |
| **Visual C++ Redistributable** | 2015–2022 (often already installed) |
| **Same LAN as host** | Host running `dev:api:lan` |
| **Port 4832 free** | Proxy tries 4832–4839 if busy |

No Node.js, Python, or Rust on teammate PCs.

## Logs and debug

| Item | Location |
|------|----------|
| Log file | `%LOCALAPPDATA%\com.jbhm.desktop.client\logs\jbhm-client.log` |
| Config | `%APPDATA%\com.jbhm.desktop.client\client.json` |
| Debug console | `set JBHM_CLIENT_CONSOLE=1` then run `jbhm-gateway.exe` |

Good log lines: `proxy bind ok`, `local proxy HTTP ready`, `load data ok`, `proxy forward ok`.

## Astrill VPN

Astrill can stay **connected** (including “Tunnel all apps”). The old **`jbhm-desktop.exe`** Tauri build is **removed** from the client installer because Event Viewer showed crashes in **`ASProxy64.dll`** inside the WebView process.

This client uses **Chrome only** for UI; Chrome is typically already allowed in Astrill App Guard.

Optional: Astrill **Application Filter** → tunnel only Chrome if you need tighter control.

## Troubleshooting

| Problem | Check |
|---------|--------|
| Browser shows “UI files missing” | `www` folder must sit next to `jbhm-gateway.exe` (installer does this) |
| “Host server not configured” | Set **Host Server** in the UI |
| “Cannot reach host server” | Host `dev:api:lan`, correct IP, firewall, same Wi‑Fi |
| Extension capture fails | Extension API must be `http://127.0.0.1:4832` |
| Port 4832 in use | Close other apps; client tries 4833–4839 |
| No data after open | Wait for “proxy ready” banner; check log for `http_ready` |
