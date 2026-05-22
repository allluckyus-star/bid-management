<#
.SYNOPSIS
  Compare Astrill + jbhm-gateway setup across PCs (Admin, Elite, Miller).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ".\scripts\astrill-compare-report.ps1"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ".\scripts\astrill-compare-report.ps1" -OpenReport:$false
#>
[CmdletBinding()]
param(
    [string]$OutputPath,
    [switch]$NoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Resolve-ReportFolder {
    $candidates = @(
        [Environment]::GetFolderPath("Desktop")
        (Join-Path $env:USERPROFILE "Desktop")
        (Join-Path $env:USERPROFILE "OneDrive\Desktop")
        (Join-Path $env:USERPROFILE "OneDrive - Personal\Desktop")
        (Join-Path $env:USERPROFILE "Documents")
        $env:USERPROFILE
        $env:TEMP
    ) | Where-Object { $_ -and (Test-Path $_ -PathType Container) }

    if ($candidates.Count -gt 0) { return $candidates[0] }
    return $env:TEMP
}

function Add-Section {
    param([string]$Title)
    $script:Lines.Add("")
    $script:Lines.Add("=== $Title ===")
}

$Lines = [System.Collections.Generic.List[string]]::new()
$Lines.Add("JBHM Astrill comparison report")
$Lines.Add("PC: $env:COMPUTERNAME | User: $env:USERNAME | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$Lines.Add("")

# --- ASProxy64.dll ---
Add-Section "ASProxy64.dll"
$dll = Get-Item "C:\Windows\System32\ASProxy64.dll" -ErrorAction SilentlyContinue
if ($dll) {
    $Lines.Add($dll.FullName)
    $Lines.Add("Size: $($dll.Length) bytes")
    $Lines.Add("Modified: $($dll.LastWriteTime)")
    $Lines.Add("Version: $($dll.VersionInfo.FileVersion) ($($dll.VersionInfo.CompanyName))")
} else {
    $Lines.Add("NOT FOUND in System32")
}

# --- Astrill install ---
Add-Section "Astrill install"
$installDir = "C:\Program Files (x86)\Astrill"
if (Test-Path $installDir) {
    Get-ChildItem $installDir -File -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object { $Lines.Add(("{0,-28} {1,10} {2}" -f $_.Name, $_.Length, $_.LastWriteTime.ToString("yyyy-MM-dd"))) }
} else {
    $Lines.Add("Missing: $installDir")
}

# --- Astrill process ---
Add-Section "Astrill process"
$astrill = Get-Process -Name "astrill*" -ErrorAction SilentlyContinue
if ($astrill) {
    foreach ($p in $astrill) { $Lines.Add("$($p.Name) pid=$($p.Id) $($p.Path)") }
} else {
    $Lines.Add("(not running)")
}

# --- Registry ---
Add-Section "Registry HKLM\SOFTWARE\WOW6432Node\Astrill"
$regWow = "HKLM:\SOFTWARE\WOW6432Node\Astrill"
if (Test-Path $regWow) {
    $r = Get-ItemProperty $regWow
    $Lines.Add("InstallPath: $($r.InstallPath)")
    $Lines.Add("DriverGuid: $($r.DriverGuid)")
    if ($r.DriverSettings) {
        $hash = [BitConverter]::ToString(
            [System.Security.Cryptography.SHA256]::Create().ComputeHash([byte[]]$r.DriverSettings)
        ).Replace("-", "").Substring(0, 16)
        $Lines.Add("DriverSettings: $($r.DriverSettings.Length) bytes (sha256 prefix: $hash)")
    }
    $Lines.Add("")
    $Lines.Add("BlockedApps (compare this across PCs):")
    if ([string]::IsNullOrWhiteSpace($r.BlockedApps)) {
        $Lines.Add("  (empty — often means tunnel ALL apps, or filter not saved)")
    } else {
        $r.BlockedApps -split "`r?`n" | ForEach-Object {
            $app = $_.Trim()
            if ($app) { $Lines.Add("  $app") }
        }
    }
    $Lines.Add("")
    $Lines.Add("Note: If jbhm-gateway.exe is NOT listed and Miller still crashes,")
    $Lines.Add("      Astrill may use 'tunnel all' in UI without listing apps here.")
} else {
    $Lines.Add("Registry key missing")
}

Add-Section "Registry HKLM\Software\Astrill"
if (Test-Path "HKLM:\Software\Astrill") {
    $r2 = Get-ItemProperty "HKLM:\Software\Astrill"
    $r2.PSObject.Properties |
        Where-Object { $_.Name -notmatch "^PS" } |
        ForEach-Object { $Lines.Add("$($_.Name): $($_.Value)") }
} else {
    $Lines.Add("(key missing)")
}

# --- LSP ---
Add-Section "registerlsp.ini (Winsock layer order)"
$iniPath = Join-Path $installDir "registerlsp.ini"
if (Test-Path $iniPath) {
    Get-Content $iniPath -ErrorAction SilentlyContinue | ForEach-Object { $Lines.Add($_) }
} else {
    $Lines.Add("(missing)")
}

# --- jbhm-gateway ---
Add-Section "jbhm-gateway process"
$gateway = Get-Process -Name "jbhm-gateway" -ErrorAction SilentlyContinue
if (-not $gateway) {
    $Lines.Add("NOT RUNNING — start jbhm-gateway.exe, then run this script again.")
} else {
    $Lines.Add("RUNNING pid=$($gateway.Id)")
    $proxyMods = $gateway.Modules | Where-Object { $_.ModuleName -match "ASProxy|astrill" }
    if ($proxyMods) {
        $Lines.Add("ASProxy/Astrill modules loaded (injection active):")
        $proxyMods | ForEach-Object { $Lines.Add("  $($_.ModuleName) -> $($_.FileName)") }
    } else {
        $Lines.Add("No ASProxy modules in process (injection may be off for this exe).")
    }
}

# --- Port + health ---
Add-Section "Port 4832 (netstat)"
$netLines = @(netstat -ano | Select-String ":4832")
if ($netLines.Count -eq 0) {
    $Lines.Add("(nothing listening — gateway crashed or not started)")
} else {
    $netLines | ForEach-Object { $Lines.Add($_.Line.Trim()) }
}

Add-Section "Local health http://127.0.0.1:4832/health"
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4832/health" -UseBasicParsing -TimeoutSec 4
    $Lines.Add("OK status=$($resp.StatusCode)")
    $Lines.Add($resp.Content)
} catch {
    $Lines.Add("FAILED: $($_.Exception.Message)")
    $Lines.Add("(If gateway crashes, Astrill ASProxy64 injection is likely — see Event Viewer below)")
}

# --- Event Viewer ---
Add-Section "Event Viewer — last crashes (jbhm-gateway / ASProxy64 / jbhm-desktop)"
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName   = "Application"
        Level     = 2, 3
        StartTime = (Get-Date).AddDays(-14)
    } -MaxEvents 500 -ErrorAction Stop |
        Where-Object { $_.Message -match "jbhm-gateway|jbhm-desktop|ASProxy64" } |
        Select-Object -First 8

    if (-not $events) {
        $Lines.Add("(no matching errors in last 14 days)")
    } else {
        foreach ($ev in $events) {
            $first = ($ev.Message -split "`r?`n")[0]
            $Lines.Add("$($ev.TimeCreated.ToString('yyyy-MM-dd HH:mm')) | $($ev.LevelDisplayName) | $first")
            if ($ev.Message -match "Faulting module name:\s*(\S+)") {
                $Lines.Add("  -> Faulting module: $($Matches[1])")
            }
            if ($ev.Message -match "Exception code:\s*(\S+)") {
                $Lines.Add("  -> Exception code: $($Matches[1])")
            }
        }
    }
} catch {
    $Lines.Add("Could not read Application log: $($_.Exception.Message)")
}

Add-Section "What to compare on each PC"
$Lines.Add("1. BlockedApps list (same apps on Admin/Elite vs Miller?)")
$Lines.Add("2. jbhm-gateway: running + health OK vs crash + Event Viewer ASProxy64")
$Lines.Add("3. DriverSettings hash (same prefix = similar VPN driver config)")
$Lines.Add("4. Fix on Miller: Astrill App Filter -> tunnel ONLY Chrome; exclude jbhm-gateway.exe")

# --- Save ---
if (-not $OutputPath) {
    $folder = Resolve-ReportFolder
    $OutputPath = Join-Path $folder ("astrill-report-{0}.txt" -f $env:COMPUTERNAME)
}

$parent = Split-Path $OutputPath -Parent
if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$Lines | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host ""
Write-Host "Report saved:" -ForegroundColor Green
Write-Host "  $OutputPath"
Write-Host ""
Write-Host "Send this file from each PC (Admin, Elite, Miller) for comparison."
Write-Host ""

if (-not $NoOpen) {
    Start-Process notepad.exe $OutputPath
}

# Return path for automation
$OutputPath
