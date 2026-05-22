# Demo data (CLI) — test auto-refresh

The desktop / client app reloads data **every 1 minute**. Use these commands on the **host PC** (where the API runs) to add jobs so you can confirm the UI updates.

## Prerequisites

**Terminal 1 — API (host):**

```bash
npm run dev:api:lan
```

**Terminal 2 — Client (optional):**

```bash
npm run tauri:dev:client -w @jbhm/desktop
```

Or run the installed **Client** `.exe`.

---

## One-shot options

### Many sample jobs (charts + table)

```bash
npm run seed
```

Clear DB and re-seed:

```bash
npm run seed:reset
```

### Single demo job (same as UI “+1 demo”)

```bash
npm run demo:once
```

HTTP equivalent:

```bash
curl -X POST "http://127.0.0.1:5123/dev/seed-sample"
```

---

## Repeat demo every N seconds (best for refresh test)

Every **60 seconds** (matches app poll; use **30** for a quicker check):

```bash
npm run demo:tick
```

Faster interval (new job every 30s → visible within ~1 min UI poll):

```bash
cd apps/api
python -m scripts.demo_tick --interval 30 --user "Demo User"
```

One job only:

```bash
npm run demo:once
```

Custom API URL (teammate machine posting through local proxy):

```bash
python -m scripts.demo_tick --interval 30 --api http://127.0.0.1:5123 --user "Teammate A"
```

Stop with **Ctrl+C**.

---

## What you should see

1. `demo:tick` prints `[1] 200 ...`, `[2] 200 ...` in the host terminal.
2. Within **~1 minute**, the client window/table total increases (no manual Refresh).
3. Timeline chart updates on the same poll.

---

## Host UI buttons (not in client `.exe`)

| Action | Where |
|--------|--------|
| **+1 demo** | `npm run dev:desktop` (host browser only) |
| **Load sample data** | Host dev UI only |

Client build hides those buttons; use **CLI on the host** instead.
