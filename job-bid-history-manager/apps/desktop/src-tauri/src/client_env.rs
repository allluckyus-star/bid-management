//! Startup environment snapshot for comparing working vs broken teammate PCs.

use std::net::TcpListener as StdListener;
use std::process::Command;
use std::time::Instant;

const PROBE_PORTS: [u16; 4] = [4832, 4833, 5123, 5124];

pub fn log_environment_snapshot() {
    crate::client_log::info("=== environment snapshot (compare working vs broken PCs) ===");

    log_env_vars();
    log_webview2_registry();
    log_port_probes();
    log_command("netstat", &["-ano"], "ports 4832/5123");
    log_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "[Environment]::OSVersion.VersionString; (Get-CimInstance Win32_OperatingSystem).Caption; \
             (Get-CimInstance Win32_OperatingSystem).BuildNumber",
        ],
        "OS caption",
    );
    log_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "Get-NetConnectionProfile | Select-Object InterfaceAlias,NetworkCategory,IPv4Connectivity | Format-List",
        ],
        "network profile",
    );
    log_command(
        "netsh",
        &["advfirewall", "show", "currentprofile"],
        "firewall profile",
    );
    log_command("whoami", &[], "user");
    log_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "Get-Process -Name 'Job Bid History Manager (Client)' -ErrorAction SilentlyContinue | Select-Object Id,Path",
        ],
        "existing client process",
    );

    crate::client_log::info("=== end environment snapshot ===");
}

fn log_env_vars() {
    for key in [
        "USERNAME",
        "COMPUTERNAME",
        "USERDOMAIN",
        "PROCESSOR_ARCHITECTURE",
        "OS",
    ] {
        match std::env::var(key) {
            Ok(v) => crate::client_log::info(format!("env {key}={v}")),
            Err(_) => crate::client_log::debug(format!("env {key}=(not set)")),
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        crate::client_log::info(format!("exe path: {}", exe.display()));
    }
}

fn log_webview2_registry() {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            "/v",
            "pv",
        ])
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            let line = stdout.trim().lines().last().unwrap_or("(no pv line)");
            crate::client_log::info(format!("WebView2 registry: {line}"));
            if !stderr.trim().is_empty() {
                crate::client_log::debug(format!("WebView2 reg stderr: {}", stderr.trim()));
            }
        }
        Err(err) => crate::client_log::warn(format!("WebView2 reg query failed: {err}")),
    }
}

fn log_port_probes() {
    for port in PROBE_PORTS {
        let addr = format!("127.0.0.1:{port}");
        let started = Instant::now();
        match StdListener::bind(&addr) {
            Ok(_) => crate::client_log::info(format!(
                "port probe: {addr} bind OK ({}ms) — free before app proxy",
                started.elapsed().as_millis()
            )),
            Err(err) => crate::client_log::warn(format!(
                "port probe: {addr} bind FAIL ({}ms): {err} — may be in use",
                started.elapsed().as_millis()
            )),
        }
    }
}

fn log_command(program: &str, args: &[&str], label: &str) {
    let started = Instant::now();
    match Command::new(program).args(args).output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let compact: String = stdout
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .take(12)
                .collect::<Vec<_>>()
                .join(" | ");
            crate::client_log::info(format!(
                "{label} ({}ms, exit={}): {}",
                started.elapsed().as_millis(),
                out.status.code().unwrap_or(-1),
                if compact.is_empty() { "(empty)" } else { &compact }
            ));
        }
        Err(err) => crate::client_log::warn(format!("{label} command failed: {err}")),
    }
}
