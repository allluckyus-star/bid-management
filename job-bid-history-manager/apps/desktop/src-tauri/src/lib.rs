#[cfg(feature = "client")]
pub mod client_config;
#[cfg(not(feature = "client"))]
mod client_config;

#[cfg(feature = "client")]
pub mod client_env;

#[cfg(feature = "client")]
pub mod client_log;

#[cfg(feature = "client")]
pub mod proxy;

#[cfg(feature = "client")]
pub mod proxy_blocking;

pub mod extension_install;

use serde::Serialize;
use std::{
    path::PathBuf,
    process::Command,
    sync::{Arc, RwLock},
};
use tauri::{Manager, RunEvent, WindowEvent};

type ExtensionInstallInfo = extension_install::ExtensionInstallInfo;

#[derive(Clone, Serialize)]
struct ClientInfo {
    is_client: bool,
    local_api_url: String,
    upstream_url: Option<String>,
    proxy_listen: String,
    proxy_ready: bool,
    /// True when local GET /health succeeded (UI may fetch).
    proxy_http_ready: bool,
    /// Host /health probe from Rust (None = not checked yet).
    host_reachable: Option<bool>,
    proxy_error: Option<String>,
}

#[cfg(feature = "client")]
struct ClientAppState {
    upstream: proxy::UpstreamStore,
    proxy_status: proxy::ProxyStatusStore,
    last_logged_client_sig: std::sync::Mutex<String>,
}

fn extension_install_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("failed to resolve app data directory: {err}"))?;
    Ok(base.join("chrome-extension"))
}

fn extract_extension_if_missing(app: &tauri::AppHandle) -> Result<ExtensionInstallInfo, String> {
    let install_dir = extension_install_dir(app)?;
    #[cfg(feature = "client")]
    let client_mode = true;
    #[cfg(not(feature = "client"))]
    let client_mode = false;
    extension_install::ensure_at(install_dir, client_mode)
}

#[tauri::command]
fn ensure_extension_folder(app: tauri::AppHandle) -> Result<ExtensionInstallInfo, String> {
    extract_extension_if_missing(&app)
}

#[tauri::command]
fn open_extension_folder(app: tauri::AppHandle) -> Result<ExtensionInstallInfo, String> {
    let info = extract_extension_if_missing(&app)?;

    Command::new("explorer")
        .arg(&info.path)
        .spawn()
        .map_err(|err| format!("failed to open extension folder: {err}"))?;

    Ok(info)
}

#[cfg(feature = "client")]
pub(crate) fn read_client_info_for_proxy(
    upstream: &proxy::UpstreamStore,
    proxy_status: &proxy::ProxyStatusStore,
) -> ClientInfo {
    let upstream_url = upstream.read().ok().and_then(|v| v.clone());
    let proxy = proxy_status.read().ok();
    let proxy_error = proxy.as_ref().and_then(|p| p.error.clone());
    let proxy_http_ready = proxy.as_ref().map(|p| p.http_ready).unwrap_or(false);
    let host_reachable = proxy.as_ref().and_then(|p| p.host_reachable);
    let proxy_ready = proxy
        .as_ref()
        .map(|p| p.listen_url.is_some() && p.http_ready && p.error.is_none())
        .unwrap_or(false);
    let listen_url = if proxy_ready {
        proxy
            .as_ref()
            .and_then(|p| p.listen_url.clone())
            .unwrap_or_else(|| proxy::LOCAL_API_URL.to_string())
    } else {
        String::new()
    };
    ClientInfo {
        is_client: true,
        local_api_url: if listen_url.is_empty() {
            proxy::LOCAL_API_URL.to_string()
        } else {
            listen_url.clone()
        },
        upstream_url,
        proxy_listen: listen_url,
        proxy_ready,
        proxy_http_ready,
        host_reachable,
        proxy_error,
    }
}

#[cfg(feature = "client")]
fn read_client_info(state: &ClientAppState) -> ClientInfo {
    read_client_info_for_proxy(&state.upstream, &state.proxy_status)
}

#[cfg(feature = "client")]
fn client_info_signature(info: &ClientInfo) -> String {
    format!(
        "ready={} http={} host={:?} listen={} upstream={:?} err={:?}",
        info.proxy_ready,
        info.proxy_http_ready,
        info.host_reachable,
        info.local_api_url,
        info.upstream_url,
        info.proxy_error
    )
}

#[cfg(feature = "client")]
#[tauri::command]
fn get_client_info(state: tauri::State<ClientAppState>) -> ClientInfo {
    let info = read_client_info(&state);
    let sig = client_info_signature(&info);
    if let Ok(mut guard) = state.last_logged_client_sig.lock() {
        if *guard != sig {
            *guard = sig.clone();
            client_log::info(format!("client status: {sig}"));
        }
    }
    info
}

#[cfg(feature = "client")]
#[tauri::command]
fn set_upstream_url(
    app: tauri::AppHandle,
    state: tauri::State<ClientAppState>,
    url: String,
) -> Result<ClientInfo, String> {
    let normalized = client_config::normalize_upstream_url(&url)?;
    {
        let mut guard = state
            .upstream
            .write()
            .map_err(|_| "proxy state unavailable".to_string())?;
        *guard = Some(normalized.clone());
    }
    client_config::save(
        &app,
        &client_config::ClientConfigFile {
            upstream_url: Some(normalized.clone()),
        },
    )?;
    client_log::info(format!("host server set to {normalized}"));
    Ok(read_client_info(&state))
}

#[cfg(feature = "client")]
#[tauri::command]
fn get_client_log_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(client_log::log_file_path(&app)?.display().to_string())
}

#[cfg(feature = "client")]
#[tauri::command]
fn log_client_message(level: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "error" => client_log::error(message),
        "warn" => client_log::warn(message),
        "debug" => client_log::debug(message),
        _ => client_log::info(message),
    }
    Ok(())
}

#[cfg(not(feature = "client"))]
#[tauri::command]
fn get_client_info() -> ClientInfo {
    ClientInfo {
        is_client: false,
        local_api_url: String::new(),
        upstream_url: None,
        proxy_listen: String::new(),
        proxy_ready: false,
        proxy_http_ready: false,
        host_reachable: None,
        proxy_error: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "client")]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .on_window_event(|window, event| {
                let label = window.label();
                match event {
                    WindowEvent::CloseRequested { api: _, .. } => {
                        client_log::warn(format!("WindowEvent::CloseRequested label={label}"));
                    }
                    WindowEvent::Destroyed => {
                        client_log::error(format!(
                            "WindowEvent::Destroyed label={label} (window/webview torn down — if app exits next, likely WebView2 crash)"
                        ));
                    }
                    WindowEvent::Focused(focused) => {
                        client_log::info(format!("WindowEvent::Focused label={label} focused={focused}"));
                    }
                    _ => {}
                }
            })
            .setup(|app| {
                let handle = app.handle().clone();
                if let Err(err) = client_log::init(&handle) {
                    eprintln!("jbhm: failed to init log file: {err}");
                }
                // Don't block the UI/proxy ~10s on PowerShell/reg probes (Miller: WebView can crash during wait).
                std::thread::spawn(|| client_env::log_environment_snapshot());
                let loaded = match client_config::load(&handle) {
                    Ok(v) => v,
                    Err(err) => {
                        client_log::error(format!("client config load failed: {err}"));
                        return Err(err.into());
                    }
                };
                if let Ok(config_path) = client_config::config_path(&handle) {
                    client_log::info(format!("client.json path: {}", config_path.display()));
                }
                client_log::info(format!(
                    "upstream default/config: {:?}",
                    loaded.upstream_url
                ));
                let upstream = Arc::new(RwLock::new(loaded.upstream_url));
                let proxy_status = Arc::new(RwLock::new(proxy::ProxyStatus::default()));
                proxy::spawn_proxy(upstream.clone(), proxy_status.clone());
                app.manage(ClientAppState {
                    upstream,
                    proxy_status,
                    last_logged_client_sig: std::sync::Mutex::new(String::new()),
                });
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                ensure_extension_folder,
                open_extension_folder,
                get_client_info,
                set_upstream_url,
                get_client_log_path,
                log_client_message
            ])
            .build(tauri::generate_context!())
            .expect("error while building tauri application")
            .run(|_app, event| {
                match event {
                    RunEvent::Ready => client_log::info("tauri RunEvent::Ready"),
                    RunEvent::Exit => {
                        client_log::info("tauri RunEvent::Exit (app shutting down — normal or webview crash)");
                    }
                    RunEvent::ExitRequested { code, .. } => {
                        client_log::warn(format!("RunEvent::ExitRequested code={code:?}"));
                    }
                    RunEvent::MainEventsCleared => {}
                    other => client_log::info(format!("tauri event: {other:?}")),
                }
            });
    }

    #[cfg(not(feature = "client"))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .invoke_handler(tauri::generate_handler![
                ensure_extension_folder,
                open_extension_folder,
                get_client_info
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
