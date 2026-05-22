use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::Manager;

/// Default team host API (used until the user saves a different Host Server URL).
pub const DEFAULT_UPSTREAM_URL: &str = "http://192.168.100.17:5123";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClientConfigFile {
    pub upstream_url: Option<String>,
}

pub fn default_upstream() -> String {
    normalize_upstream_url(DEFAULT_UPSTREAM_URL)
        .unwrap_or_else(|_| DEFAULT_UPSTREAM_URL.to_string())
}

pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve config directory: {e}"))?;
    Ok(dir.join("client.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<ClientConfigFile, String> {
    let path = config_path(app)?;
    let mut config = if !path.exists() {
        ClientConfigFile::default()
    } else {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        serde_json::from_str(&raw).map_err(|e| format!("invalid client config: {e}"))?
    };

    if let Some(ref url) = config.upstream_url {
        if let Some(fixed) = normalize_stored_upstream(url) {
            config.upstream_url = Some(fixed);
        }
    } else {
        config.upstream_url = Some(default_upstream());
    }

    Ok(config)
}

pub fn save(app: &tauri::AppHandle, config: &ClientConfigFile) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create config directory: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(config)
        .map_err(|e| format!("failed to serialize client config: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("failed to write {}: {e}", path.display()))
}

const DEFAULT_API_PORT: u16 = 5123;

pub fn normalize_upstream_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Host server URL is required.".into());
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let mut parsed = reqwest::Url::parse(&with_scheme)
        .map_err(|_| "Enter a valid URL like http://192.168.1.50:5123".to_string())?;
    if parsed.host_str().is_none() {
        return Err("Enter a valid host address.".into());
    }
    // http://192.168.x.x without :5123 would hit port 80 — API listens on 5123
    if parsed.port().is_none() {
        parsed
            .set_port(Some(DEFAULT_API_PORT))
            .map_err(|_| "Could not apply default port 5123.".to_string())?;
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub fn normalize_stored_upstream(url: &str) -> Option<String> {
    normalize_upstream_url(url).ok()
}

/// Same path as Tauri `app_config_dir` / `client.json` (browser-mode gateway, no WebView).
#[cfg(feature = "client")]
pub fn standalone_config_path() -> Result<PathBuf, String> {
    let roaming = std::env::var("APPDATA")
        .map_err(|e| format!("APPDATA not set: {e}"))?;
    Ok(PathBuf::from(roaming)
        .join("com.jbhm.desktop.client")
        .join("client.json"))
}

#[cfg(feature = "client")]
pub fn load_standalone() -> Result<ClientConfigFile, String> {
    let path = standalone_config_path()?;
    let mut config = if !path.exists() {
        ClientConfigFile::default()
    } else {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        serde_json::from_str(&raw).map_err(|e| format!("invalid client config: {e}"))?
    };
    if let Some(ref url) = config.upstream_url {
        if let Some(fixed) = normalize_stored_upstream(url) {
            config.upstream_url = Some(fixed);
        }
    } else {
        config.upstream_url = Some(default_upstream());
    }
    Ok(config)
}

#[cfg(feature = "client")]
pub fn save_standalone(config: &ClientConfigFile) -> Result<(), String> {
    let path = standalone_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create config directory: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(config)
        .map_err(|e| format!("failed to serialize client config: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("failed to write {}: {e}", path.display()))
}
