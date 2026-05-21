# Astrill VPN + LAN Sharing Fix

**Your issue:** 
- ✓ `http://198.18.5.240:1420/` works (Astrill virtual IP)  
- ✗ `http://192.168.100.17:1420/` doesn't work (real LAN IP)  
- ✗ Teammates on other PCs: both IPs fail

**Root cause:** Astrill VPN is intercepting/blocking real LAN traffic to your real Ethernet IP.

---

## Quick Fix (Try First)

### Step 1: Disable Astrill Browser Extension

1. Open Chrome: `chrome://extensions`
2. Find **Astrill** extension
3. **Toggle OFF** (temporarily) while testing LAN access
4. Reload the page: `http://192.168.100.17:1420/`

**Expected result:** Should load now.

---

### Step 2: Check Astrill Settings for LAN Bypass

Unfortunately you couldn't find these options, but they may exist under different names:

**In Astrill app:**
- Settings → Network → **"Allow LAN/Local Network"**
- Settings → Security → **"Split tunneling"** → Add `192.168.x.x` range
- Settings → Advanced → **"Bypass for local traffic"**
- Help / Support → Search for "**local network**" or "**LAN**"

**If not found:** Astrill version may not support LAN bypass. Next solution below.

---

### Step 3: Use Astrill Virtual Adapter IP for Teammates

Since **`198.18.5.240:1420` works**, you can have teammates use this IP:

**Teammates:** Open `http://198.18.5.240:1420/`

**Advantage:** Works without disabling Astrill  
**Disadvantage:** `198.18.5.240` only exists when Astrill is running on the host PC; if it disconnects, IP changes or disappears

---

## Better Solution: Disable Astrill Temporarily While Testing

To verify the servers work with LAN colleagues:

1. **On your PC:** Close/disconnect Astrill completely
2. Your real adapter: `192.168.100.17` (should stay)
3. Teammates try: `http://192.168.100.17:1420/` 
4. Check Firewall is not blocking (see below)

---

## Windows Firewall Rules

If real LAN IP still doesn't work after disabling Astrill, check firewall:

**PowerShell (as Admin):**
```powershell
# Check existing rules
Get-NetFirewallRule -DisplayName "*1420*" 
Get-NetFirewallRule -DisplayName "*5123*" 

# If missing, add rules:
New-NetFirewallRule -DisplayName "Allow Vite 1420" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1420 -Profile Private
New-NetFirewallRule -DisplayName "Allow API 5123" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5123 -Profile Private
```

---

## Advanced: Astrill "Do Not Route" List

Some VPN apps have a **"Do Not Route"** or **"Exclude from VPN"** list:

1. Astrill Settings → Network/Routing
2. Add your **LAN subnet** (`192.168.100.0/24`) to bypass list
3. Restart Astrill

This allows real LAN traffic while keeping internet traffic through VPN.

---

## Team Workflow Options

### Option A: Use Astrill Virtual IP (198.18.5.240)
```
npm run dev:api:lan       # Terminal 1
npm run dev:web:lan       # Terminal 2

Teammates open: http://198.18.5.240:1420/
```
✓ No need to disable anything  
✗ Fragile (IP changes if Astrill disconnects)

### Option B: Disable Astrill for Team Sessions
```
1. Astrill → Disconnect (temporary)
2. npm run dev:api:lan
3. npm run dev:web:lan
4. Teammates: http://192.168.100.17:1420/
5. Re-enable Astrill when done
```
✓ More stable, real LAN IP  
✗ Your internet goes unencrypted

### Option C: Astrill LAN Bypass (If Available)
```
1. Astrill Settings → Enable "Allow Local Network"
2. Keep Astrill connected
3. npm run dev:api:lan
4. npm run dev:web:lan
5. Teammates: http://192.168.100.17:1420/
```
✓ Best of both worlds  
✗ Depends on Astrill version/support

---

## Testing Checklist

- [ ] Run: `npm run dev:api:lan` (listens on `0.0.0.0:5123`)
- [ ] Run: `npm run dev:web:lan` (listens on `0.0.0.0:1420`, proxies to API)
- [ ] Browser on host: `http://localhost:1420/` → should work ✓
- [ ] Browser on host: `http://198.18.5.240:1420/` → works with Astrill ✓
- [ ] Browser on host: `http://192.168.100.17:1420/` → works if Astrill disabled/configured ✓
- [ ] Browser on teammate PC: `http://192.168.100.17:1420/` → ensure same LAN/VLAN
- [ ] Firewall: ensure ports 1420 & 5123 allowed on Private network
- [ ] Network profile: Ethernet should be **Private**, not Public

---

## Still Not Working?

Try this diagnostic:

```powershell
# On host, from PowerShell:
Test-NetConnection 192.168.100.17 -CommonTCPPort HTTP

# On teammate PC, from PowerShell:
Test-NetConnection 192.168.100.17 -CommonTCPPort HTTP
```

If that fails → network/firewall issue (not Astrill)  
If that works but browser fails → Astrill extension blocking

---

## Astrill Support

Contact Astrill support:
- "I need to allow local network (LAN) traffic while using VPN for internet"
- "Can you enable LAN bypass for `192.168.100.0/24`?"
- Request documentation for your Astrill version
