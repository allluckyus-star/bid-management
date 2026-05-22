//! Browser-mode client for PCs where Astrill ASProxy64 crashes the Tauri/WebView2 process.
//! Serves UI + API on http://127.0.0.1:4832 and opens the default browser (Chrome works with Astrill).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use jbhm_desktop_lib::client_config;
use jbhm_desktop_lib::client_log;
use jbhm_desktop_lib::proxy;
use jbhm_desktop_lib::proxy_blocking;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

#[cfg(all(windows, feature = "client"))]
fn attach_debug_console() {
    if std::env::var_os("JBHM_CLIENT_CONSOLE").is_none() {
        return;
    }
    unsafe {
        windows_sys::Win32::System::Console::AllocConsole();
    }
    eprintln!("JBHM gateway: debug console (JBHM_CLIENT_CONSOLE=1)");
}

fn resolve_www_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("JBHM_WWW") {
        let p = PathBuf::from(dir);
        if p.join("index.html").exists() {
            return p;
        }
    }

    let exe = std::env::current_exe().ok();
    let base = exe
        .as_ref()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    for candidate in [
        "www",
        "dist",
        "resources/www",
        "resources/dist",
        "_up_/www",
        "_up_/resources/www",
    ] {
        let dir = base.join(candidate);
        if dir.join("index.html").exists() {
            return dir;
        }
    }
    base.join("www")
}

fn open_default_browser(url: &str) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn main() {
    #[cfg(all(windows, feature = "client"))]
    attach_debug_console();

    if let Err(err) = client_log::init_standalone() {
        eprintln!("jbhm-gateway: failed to init log: {err}");
    }

    client_log::info("Job Bid History Manager client — local proxy + Chrome UI (no WebView2)");

    match jbhm_desktop_lib::extension_install::ensure_standalone() {
        Ok(info) => client_log::info(format!(
            "chrome extension at {} (created={})",
            info.path, info.created
        )),
        Err(err) => client_log::warn(format!("chrome extension extract: {err}")),
    }

    let config = match client_config::load_standalone() {
        Ok(c) => c,
        Err(err) => {
            client_log::error(format!("config load failed: {err}"));
            eprintln!("Failed to load config: {err}");
            std::process::exit(1);
        }
    };

    let upstream_url = config.upstream_url.clone();
    client_log::info(format!("upstream: {:?}", upstream_url));

    let www = resolve_www_dir();
    let upstream = Arc::new(RwLock::new(upstream_url));
    let status = Arc::new(RwLock::new(proxy::ProxyStatus::default()));

    let open_url = "http://127.0.0.1:4832/".to_string();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1200));
        client_log::info(format!("opening default browser at {open_url}"));
        open_default_browser(&open_url);
    });

    if let Err(err) = proxy_blocking::run_browser_mode(upstream, status, www) {
        client_log::error(format!("gateway failed: {err}"));
        eprintln!("Gateway failed: {err}");
        std::process::exit(1);
    }
}
