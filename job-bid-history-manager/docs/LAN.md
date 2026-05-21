# Use on your local network (LAN)

One computer runs the **API + database**; teammates open the **web UI** in a browser (or point their own UI at your API).

## 1. Host machine (your PC)

### Find your LAN IP (Windows)

```bash
ipconfig
```

Use the **IPv4 Address** on your Wi‑Fi/Ethernet adapter (e.g. `192.168.1.50`).

### Configure the UI to call the API on that IP

```bash
cd job-bid-history-manager/apps/desktop
copy .env.lan.example .env
```

Edit `.env` and set:

```env
VITE_API_BASE_URL=http://192.168.1.50:5123
```

(Use your real IP.)

### Start API and web UI for LAN

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

- API: `http://127.0.0.1:5123/health`
- API via LAN: `http://192.168.1.50:5123/health`
- UI: `http://192.168.1.50:1420`

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
| UI loads but “API error” | `VITE_API_BASE_URL` must be host **LAN IP**, not `127.0.0.1`, on the machine running Vite |
| Extension capture fails | Extension API URL = `http://HOST_IP:5123`; reload extension after manifest change |
| Health works on host, not LAN | API must use `dev:api:lan` (`0.0.0.0`), not `dev:api` |

## Security note

LAN mode exposes the API to your network with **no login**. Use only on trusted office/home networks.
