# Use on your local network (LAN)

One computer runs the **API + database**; teammates open the **web UI** in a browser (or point their own UI at your API).

## 1. Host machine (your PC)

### Find your LAN IP (Windows)

```bash
ipconfig
```

Use the **IPv4 Address** on your Wi‑Fi/Ethernet adapter (e.g. `192.168.1.50`).

### Start API and web UI for LAN

`npm run dev:web:lan` uses **`.env.lan`**: the UI calls `/jbhm/...` on port **1420** only, and Vite proxies to the API on `127.0.0.1:5123`. That avoids Astrill blocking direct `:5123` URLs in the browser.

Do **not** set `VITE_API_BASE_URL=http://127.0.0.1:5123` in `.env` while hosting for teammates — their browsers would call **their own** localhost. Use `dev:web:lan` (or `VITE_API_BASE_URL=/jbhm`).

**Terminal 1 — API (listens on all interfaces):**

```bash
cd job-bid-history-manager
npm run dev:api:lan
```

**Terminal 2 — Web UI:**

```bash
npm run dev:web:lan
```

### Windows Firewall

Allow inbound **TCP 5123** (API) and **TCP 1420** (web UI) on private networks when prompted, or add rules manually.

### Verify on the host

| Test | URL |
|------|-----|
| API (terminal) | `curl http://127.0.0.1:5123/health` |
| API via proxy (browser, Astrill OK) | `http://localhost:1420/jbhm/health` |
| UI (you + teammates) | `http://192.168.1.50:1420` or `http://localhost:1420` |

Avoid opening `http://192.168.1.50:5123/health` in the browser if Astrill blocks LAN IPs — use **`/jbhm/health` on port 1420** instead.

## 2. Teammates (other PCs on the same network)

In a browser, open:

```text
http://192.168.1.50:1420
```

(Replace with the host’s IP.)

Everyone shares the **same jobs database** on the host machine.

### Chrome extension (capture)

1. Load unpacked extension from `apps/extension` (each teammate).
2. In the extension popup, set **API base URL** to `http://192.168.1.50:5123` (host IP).
3. Set **Captured by** to their name.

### Optional: run UI locally, API on host

On a teammate’s PC:

```env
# apps/desktop/.env
VITE_API_BASE_URL=http://192.168.1.50:5123
```

```bash
npm run dev:desktop
```

Open `http://127.0.0.1:1420` on their machine; data still comes from the host API.

## 3. Tauri desktop app

The packaged desktop app is **local-only** by default (`127.0.0.1`). For team use, prefer the **browser + `dev:web:lan`** flow above, or build with:

```env
VITE_API_BASE_URL=http://192.168.1.50:5123
```

## 4. Troubleshooting

| Problem | What to check |
|--------|----------------|
| Teammate cannot open UI | Host IP correct? Firewall allows 1420? Same Wi‑Fi/VLAN? |
| UI loads but “API error” | Host must use `npm run dev:web:lan` (`VITE_API_BASE_URL=/jbhm`), not `127.0.0.1:5123` in `.env` |
| Extension capture fails | Extension API URL = `http://HOST_IP:5123`; reload extension after manifest change |
| Health works on host, not LAN | API must use `dev:api:lan` (`0.0.0.0`), not `dev:api` |

### “Your Internet access is blocked” in the browser (VPN off)

The API can still work in the terminal while the **browser** is blocked.

1. **Confirm the server (terminal on the host):**
   ```bash
   curl http://127.0.0.1:5123/health
   ```
   Should return JSON with `"status":"ok"`.

2. **Confirm in the browser (works with Astrill):**
   ```text
   http://localhost:1420/jbhm/health
   ```
   Not `http://192.168.100.17:5123/health` — Astrill often blocks that; the proxy path does not.

3. **Use `http://` not `https://`** — there is no TLS on these ports.

4. **Open the app:** `http://localhost:1420` (you) or `http://192.168.100.17:1420` (teammates).

4. **Astrill (even when “disconnected”):**
   - Disable the **Astrill browser extension** in Chrome (`chrome://extensions`).
   - In `ipconfig`, if you still see **`198.18.x.x`**, that is a VPN virtual adapter — ignore it for LAN sharing; teammates must use **`192.168.x.x`** (Ethernet), not `198.18.x.x`.
   - Optional: **Network Connections** → disable **Astrill** / **TAP** adapter while testing LAN.

5. **Network profile:** If Ethernet is **Public**, firewall rules must include **Public** (or switch Ethernet to **Private** in Windows Settings).

6. **Try another browser** (Edge InPrivate) with extensions disabled.

7. **Host `.env` for solo testing on the server PC:**
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:5123
   ```
   Restart `npm run dev:web:lan`. Teammates keep `http://HOST_LAN_IP:5123`.

## Using Astrill VPN (host + teammates)

Keep Astrill on for normal internet. The web UI uses **only port 1420** (`/jbhm` proxy), which Astrill usually allows.

| Who | Open in browser |
|-----|------------------|
| **Host** | `http://localhost:1420` |
| **Teammates** | `http://192.168.100.17:1420` (host Ethernet IP) |

**Do not use `198.18.x.x` (Astrill virtual IP)** — teammates cannot reach it.

### Host setup

```bash
npm run dev:api:lan
npm run dev:web:lan    # uses .env.lan → VITE_API_BASE_URL=/jbhm
```

Remove `VITE_API_BASE_URL=http://127.0.0.1:5123` from `apps/desktop/.env` while LAN hosting, or it overrides the proxy.

**Browser health check:** `http://localhost:1420/jbhm/health` (not `:5123`).

### Teammates who also use Astrill

1. Open **`http://192.168.100.17:1420`** (same Wi‑Fi, host IP).
2. Astrill app → **Allow LAN / local network** / bypass private IPs.
3. `chrome://extensions` → disable **Astrill extension** while using the app, or allow local network sites.
4. If the UI still fails, test on a **phone** (Wi‑Fi, no VPN): `http://192.168.100.17:1420/jbhm/health`.

### Chrome extension (capture only)

The extension still posts to **`http://192.168.100.17:5123`** directly. Each user sets that in the extension popup. If capture is blocked, enable Astrill **LAN access** or temporarily disconnect VPN for capture.

### Astrill settings (recommended)

- **Allow access to local network** / **LAN traffic**
- **Web Filter** off or allow `192.168.0.0/16`
- Firewall: allow inbound **1420** and **5123**

## Security note

LAN mode exposes the API to your network with **no login**. Use only on trusted office/home networks.
