mod client_config;

#[cfg(feature = "client")]
mod proxy;

use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, RwLock},
};
use tauri::Manager;

#[derive(Serialize)]
struct ExtensionInstallInfo {
    path: String,
    created: bool,
}

#[derive(Clone, Serialize)]
struct ClientInfo {
    is_client: bool,
    local_api_url: String,
    upstream_url: Option<String>,
    proxy_listen: String,
}

#[cfg(feature = "client")]
struct ClientAppState {
    upstream: proxy::UpstreamStore,
}

const EXTENSION_DIR_NAME: &str = "chrome-extension";

const MANIFEST_JSON: &str = include_str!("../../../extension/manifest.json");
const BACKGROUND_JS: &str = include_str!("../../../extension/background.js");
const CONTENT_JS: &str = include_str!("../../../extension/content.js");
const POPUP_CSS: &str = include_str!("../../../extension/popup.css");
const POPUP_HTML: &str = include_str!("../../../extension/popup.html");
const POPUP_JS: &str = include_str!("../../../extension/popup.js");
const README_MD: &str = include_str!("../../../extension/README.md");

#[cfg(feature = "client")]
const CLIENT_EXTENSION_SETUP: &str = r#"Job Bid History Manager — Chrome extension (teammate client)

1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select this folder

Extension API URL (keep default):
  http://127.0.0.1:5123

The desktop app forwards that address to your team's host PC.
Set your name in the extension popup (Captured by) before capturing jobs.
"#;

const ICON_16: &[u8] = include_bytes!("../../../extension/icons/icon16.png");
const ICON_48: &[u8] = include_bytes!("../../../extension/icons/icon48.png");
const ICON_128: &[u8] = include_bytes!("../../../extension/icons/icon128.png");

fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn write_binary_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    fs::write(path, contents).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn extension_install_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("failed to resolve app data directory: {err}"))?;
    Ok(base.join(EXTENSION_DIR_NAME))
}

fn extract_extension_if_missing(app: &tauri::AppHandle) -> Result<ExtensionInstallInfo, String> {
    let install_dir = extension_install_dir(app)?;

    if install_dir.exists() {
        return Ok(ExtensionInstallInfo {
            path: install_dir.display().to_string(),
            created: false,
        });
    }

    fs::create_dir_all(install_dir.join("icons"))
        .map_err(|err| format!("failed to create extension directory: {err}"))?;

    write_text_file(&install_dir.join("manifest.json"), MANIFEST_JSON)?;
    write_text_file(&install_dir.join("background.js"), BACKGROUND_JS)?;
    write_text_file(&install_dir.join("content.js"), CONTENT_JS)?;
    write_text_file(&install_dir.join("popup.css"), POPUP_CSS)?;
    write_text_file(&install_dir.join("popup.html"), POPUP_HTML)?;
    write_text_file(&install_dir.join("popup.js"), POPUP_JS)?;
    write_text_file(&install_dir.join("README.md"), README_MD)?;
    #[cfg(feature = "client")]
    write_text_file(
        &install_dir.join("TEAMMATE_SETUP.txt"),
        CLIENT_EXTENSION_SETUP,
    )?;
    write_binary_file(&install_dir.join("icons").join("icon16.png"), ICON_16)?;
    write_binary_file(&install_dir.join("icons").join("icon48.png"), ICON_48)?;
    write_binary_file(&install_dir.join("icons").join("icon128.png"), ICON_128)?;

    Ok(ExtensionInstallInfo {
        path: install_dir.display().to_string(),
        created: true,
    })
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
#[tauri::command]
fn get_client_info(state: tauri::State<ClientAppState>) -> ClientInfo {
    let upstream_url = state.upstream.read().ok().and_then(|v| v.clone());
    ClientInfo {
        is_client: true,
        local_api_url: proxy::LOCAL_API_URL.to_string(),
        upstream_url,
        proxy_listen: "127.0.0.1:5123".to_string(),
    }
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
    Ok(ClientInfo {
        is_client: true,
        local_api_url: proxy::LOCAL_API_URL.to_string(),
        upstream_url: Some(normalized),
        proxy_listen: "127.0.0.1:5123".to_string(),
    })
}

#[cfg(not(feature = "client"))]
#[tauri::command]
fn get_client_info() -> ClientInfo {
    ClientInfo {
        is_client: false,
        local_api_url: String::new(),
        upstream_url: None,
        proxy_listen: String::new(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "client")]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                let handle = app.handle().clone();
                let mut loaded = client_config::load(&handle)?;
                if let Some(ref url) = loaded.upstream_url {
                    if let Some(fixed) = client_config::normalize_stored_upstream(url) {
                        if fixed != *url {
                            loaded.upstream_url = Some(fixed.clone());
                            let _ = client_config::save(&handle, &loaded);
                        }
                    }
                }
                let upstream = Arc::new(RwLock::new(loaded.upstream_url));
                proxy::spawn_proxy(upstream.clone());
                app.manage(ClientAppState { upstream });
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                ensure_extension_folder,
                open_extension_folder,
                get_client_info,
                set_upstream_url
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
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
