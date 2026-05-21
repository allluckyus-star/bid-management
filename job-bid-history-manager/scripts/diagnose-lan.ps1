# Diagnostic script to test LAN connectivity and Astrill interference

Write-Host "=== LAN Diagnostic Report ===" -ForegroundColor Cyan
Write-Host ""

# 2. Test localhost
Write-Host "Testing http://localhost:1420 ..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:1420/" -ErrorAction Stop -TimeoutSec 2 -UseBasicParsing
    Write-Host "✓ localhost:1420 works (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "✗ localhost:1420 failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. Test Astrill virtual IP (198.18.x.x)
Write-Host "Testing Astrill virtual adapter (198.18.5.240)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://198.18.5.240:1420/" -ErrorAction Stop -TimeoutSec 2 -UseBasicParsing
    Write-Host "✓ http://198.18.5.240:1420 works (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "✗ http://198.18.5.240:1420 failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. Test real LAN IP (192.168.x.x)
Write-Host "Testing real LAN IP (192.168.100.17)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://192.168.100.17:1420/" -ErrorAction Stop -TimeoutSec 2 -UseBasicParsing
    Write-Host "✓ http://192.168.100.17:1420 works (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "✗ http://192.168.100.17:1420 failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   → Astrill is blocking LAN traffic to real IPs" -ForegroundColor Yellow
}
Write-Host ""

# 5. Test localhost:5123 (API directly)
Write-Host "Testing API directly (http://127.0.0.1:5123/health)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5123/health" -ErrorAction Stop -TimeoutSec 2 -UseBasicParsing
    Write-Host "✓ API works (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "✗ API failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Problem: localhost:1420 ✓ works, but 192.168.100.17:1420 ✗ fails" -ForegroundColor Yellow
Write-Host "Root cause: Astrill VPN is intercepting all traffic and forcing it through the VPN tunnel" -ForegroundColor Red
Write-Host ""
