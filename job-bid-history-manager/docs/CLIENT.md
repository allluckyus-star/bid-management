# Teammate client `.exe` (local proxy → host)

The **client** build is for teammates. One `.exe` includes:

- The desktop UI (unchanged)
- A **local HTTP proxy** on `http://127.0.0.1:5123` that forwards to the host PC
- Chrome extension files (load once in Chrome)

The host PC keeps using normal dev commands (`npm run dev:api:lan`) — no host `.exe` required while debugging.

## Build the client installer

From the repo root:

```bash
npm install
npm run build:client
```

**Windows:** `npm` runs Tauri via `cmd.exe`, which may not see `cargo` even after rustup. The project scripts use `scripts/run-with-cargo.mjs` to add `%USERPROFILE%\.cargo\bin` automatically. If build still fails, verify: `C:\Users\<you>\.cargo\bin\cargo.exe --version`

Output (typical):

- `apps/desktop/src-tauri/target/release/jbhm-desktop.exe`
- `apps/desktop/src-tauri/target/release/bundle/nsis/Job Bid History Manager (Client)_0.1.0_x64-setup.exe`

First Rust build can take 15–30 minutes.

## Host PC (you, while debugging)

**Terminal 1 — API on LAN:**

```bash
npm run dev:api:lan
```

**Firewall:** allow inbound TCP **5123** on private networks.

Find your LAN IP: `ipconfig` → e.g. `192.168.100.17`.

## Teammate PC

1. Install/run the **Client** `.exe` or NSIS setup.
2. Click **Host Server** → enter your host IP, e.g. `192.168.100.17` or `http://192.168.100.17:5123` (port **5123** is added automatically if omitted).
3. Click **Extension Folder** → Chrome → `chrome://extensions` → Developer mode → **Load unpacked**.
4. In the extension popup:
   - **API URL:** `http://127.0.0.1:5123` (default — do not use the host IP here)
   - **Captured by:** their name
5. Use the app UI and capture job pages in Chrome.

All UI and extension traffic goes to **localhost**, then the app forwards to the host over the OS network (avoids browser/Astrill blocking direct LAN URLs).

## Test client without full installer

```bash
npm run build:shared
npm run tauri:dev:client -w @jbhm/desktop
```

## Troubleshooting

| Problem | Check |
|---------|--------|
| “Host server not configured” | Set **Host Server** in the app |
| “Cannot reach host server” | Host running `dev:api:lan`, correct IP, firewall, same Wi‑Fi |
| Extension capture fails | API URL in extension must be `http://127.0.0.1:5123` |
| Port 5123 in use on teammate PC | Close other API/dev processes using 5123 |
