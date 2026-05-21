# Job Bid History Manager

Local-first Windows desktop app for tracking job bid/application history with Chrome extension capture, FastAPI + SQLite backend, and Ollama extraction.

## Monorepo layout

```
job-bid-history-manager/
  apps/
    desktop/     # Tauri v2 + React + TypeScript + ECharts
    api/         # FastAPI + SQLite
    extension/   # Chrome MV3 extension
  packages/
    shared/      # Shared TypeScript types
  docs/screenshots/
```

## Feature status (Phases 1–7)

| Phase | Features |
|-------|----------|
| 1 | Monorepo, SQLite, mock capture, desktop table |
| 2 | Chrome extension (`document.body.innerText` only) |
| 3 | Tags, FTS search, filters, soft bulk delete |
| 4 | Resume .docx upload, preview, download, unlink |
| 5 | Ollama job extraction + JD re-extract (mock fallback) |
| 6 | ECharts timeline, bucket controls, chart → table filter |
| 7 | Inline edit, notes modal, README, screenshot placeholder |

## Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **Ollama** (optional — falls back to heuristic mock if unavailable)
- **Rust** (optional — for Tauri native window)

## Quick start

```bash
cd job-bid-history-manager
npm install
pip install -r apps/api/requirements.txt
npm run build -w @jbhm/shared
```

### API (port **5123**)

```bash
npm run dev:api
```

- API: http://127.0.0.1:5123  
- Health: http://127.0.0.1:5123/health  

**Without Ollama** (heuristic extraction only):

```bash
# Windows
set JBHM_USE_MOCK_EXTRACTION=true
npm run dev:api
```

### Desktop UI

```bash
npm run dev:desktop
```

Open http://127.0.0.1:1420

### Chrome extension

1. `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension`
2. Set **Captured by** and API URL `http://127.0.0.1:5123`
3. Capture job pages via popup or right-click menu

### Team access on local network (LAN)

See **[docs/LAN.md](docs/LAN.md)** for full steps. Short version:

1. On the host PC: set `apps/desktop/.env` → `VITE_API_BASE_URL=http://YOUR_LAN_IP:5123`
2. Run `npm run dev:api:lan` and `npm run dev:web:lan`
3. Teammates open `http://YOUR_LAN_IP:1420` in a browser (allow firewall ports 5123 + 1420)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health + config |
| POST | `/capture/job` | Capture + extract job |
| GET | `/jobs` | List/search/filter jobs |
| PATCH | `/jobs/{id}` | Update fields + notes |
| DELETE | `/jobs/bulk` | Soft-delete jobs |
| GET | `/jobs/{id}/jd` | JD raw/cleaned text |
| POST | `/jobs/{id}/jd/reextract` | Re-run Ollama extraction |
| POST | `/jobs/{id}/resume` | Upload/link .docx |
| DELETE | `/jobs/{id}/resume` | Unlink resume |
| GET | `/resumes/{id}/preview` | Extracted resume text |
| GET | `/resumes/{id}/download` | Original .docx bytes |
| GET/POST/PATCH/DELETE | `/tags` | Tag CRUD |
| GET | `/analytics/timeline` | Bid counts by user/time bucket |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JBHM_USE_MOCK_EXTRACTION` | `false` | Force heuristic extraction (no Ollama) |
| `JBHM_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama API |
| `JBHM_OLLAMA_MODEL` | `llama3.2` | Model name |
| `JBHM_PORT` | `5123` | API port (via uvicorn script) |
| `VITE_API_BASE_URL` | `http://127.0.0.1:5123` | Desktop API URL |
| (scripts) | | `dev:api:lan` / `dev:web:lan` — bind API and UI to LAN; see `docs/LAN.md` |

## Screenshots

Add UI captures under `docs/screenshots/` (placeholder included).

## License

Private / local use.
