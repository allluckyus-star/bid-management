use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const EXTENSION_DIR_NAME: &str = "chrome-extension";
const EXTENSION_VERSION: &str = "0.4.0";

const MANIFEST_JSON: &str = include_str!("../../../extension/manifest.json");
const BACKGROUND_JS: &str = include_str!("../../../extension/background.js");
const CONTENT_JS: &str = include_str!("../../../extension/content.js");
const POPUP_CSS: &str = include_str!("../../../extension/popup.css");
const POPUP_HTML: &str = include_str!("../../../extension/popup.html");
const POPUP_JS: &str = include_str!("../../../extension/popup.js");
const README_MD: &str = include_str!("../../../extension/README.md");

const CLIENT_EXTENSION_SETUP: &str = r#"Job Bid History Manager — Chrome extension (teammate client)

1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select this folder
4. If the toolbar icon looks wrong: click Reload on this extension

Extension API URL (keep default):
  http://127.0.0.1:4832

The client app forwards that address to your team's host PC.
Set your name in the extension popup (Captured by) before capturing jobs.
"#;

const ICON_16: &[u8] = include_bytes!("../../../extension/icons/icon16.png");
const ICON_32: &[u8] = include_bytes!("../../../extension/icons/icon32.png");
const ICON_48: &[u8] = include_bytes!("../../../extension/icons/icon48.png");
const ICON_128: &[u8] = include_bytes!("../../../extension/icons/icon128.png");

#[derive(Clone, Serialize)]
pub struct ExtensionInstallInfo {
    pub path: String,
    pub created: bool,
    pub updated: bool,
}

fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn write_binary_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    if contents.is_empty() {
        return Err(format!("refusing to write empty file: {}", path.display()));
    }
    fs::write(path, contents).map_err(|err| format!("failed to write {}: {err}", path.display()))
}

const CLIENT_LOCAL_API: &str = "http://127.0.0.1:4832";

fn patch_extension_for_client(content: &str) -> String {
    content
        .replace("http://127.0.0.1:5123", CLIENT_LOCAL_API)
        .replace("http://localhost:5123", "http://localhost:4832")
}

fn installed_version(install_dir: &Path) -> Option<String> {
    let raw = fs::read_to_string(install_dir.join(".jbhm-version")).ok()?;
    Some(raw.trim().to_string())
}

fn write_extension_files(install_dir: &Path, client_mode: bool) -> Result<(), String> {
    fs::create_dir_all(install_dir.join("icons"))
        .map_err(|err| format!("failed to create extension directory: {err}"))?;

    if client_mode {
        write_text_file(
            &install_dir.join("manifest.json"),
            &patch_extension_for_client(MANIFEST_JSON),
        )?;
        write_text_file(
            &install_dir.join("background.js"),
            &patch_extension_for_client(BACKGROUND_JS),
        )?;
        write_text_file(&install_dir.join("popup.js"), &patch_extension_for_client(POPUP_JS))?;
    } else {
        write_text_file(&install_dir.join("manifest.json"), MANIFEST_JSON)?;
        write_text_file(&install_dir.join("background.js"), BACKGROUND_JS)?;
        write_text_file(&install_dir.join("popup.js"), POPUP_JS)?;
    }

    write_text_file(&install_dir.join("content.js"), CONTENT_JS)?;
    write_text_file(&install_dir.join("popup.css"), POPUP_CSS)?;
    write_text_file(&install_dir.join("popup.html"), POPUP_HTML)?;
    write_text_file(&install_dir.join("README.md"), README_MD)?;

    if client_mode {
        write_text_file(
            &install_dir.join("TEAMMATE_SETUP.txt"),
            CLIENT_EXTENSION_SETUP,
        )?;
    }

    write_binary_file(&install_dir.join("icons").join("icon16.png"), ICON_16)?;
    write_binary_file(&install_dir.join("icons").join("icon32.png"), ICON_32)?;
    write_binary_file(&install_dir.join("icons").join("icon48.png"), ICON_48)?;
    write_binary_file(&install_dir.join("icons").join("icon128.png"), ICON_128)?;

    write_text_file(&install_dir.join(".jbhm-version"), EXTENSION_VERSION)?;

    Ok(())
}

/// Sync extension files into install_dir (always refresh icons + scripts when version changes).
pub fn ensure_at(install_dir: PathBuf, client_mode: bool) -> Result<ExtensionInstallInfo, String> {
    let existed = install_dir.exists();
    let prev_version = if existed {
        installed_version(&install_dir)
    } else {
        None
    };

    write_extension_files(&install_dir, client_mode)?;

    let updated = prev_version.as_deref() != Some(EXTENSION_VERSION);

    Ok(ExtensionInstallInfo {
        path: install_dir.display().to_string(),
        created: !existed,
        updated,
    })
}

pub fn standalone_data_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .map_err(|e| format!("LOCALAPPDATA/APPDATA not set: {e}"))?;
    Ok(PathBuf::from(base).join("com.jbhm.desktop.client"))
}

pub fn standalone_extension_dir() -> Result<PathBuf, String> {
    Ok(standalone_data_dir()?.join(EXTENSION_DIR_NAME))
}

pub fn ensure_standalone() -> Result<ExtensionInstallInfo, String> {
    ensure_at(standalone_extension_dir()?, true)
}

pub fn open_standalone_folder() -> Result<ExtensionInstallInfo, String> {
    let info = ensure_standalone()?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&info.path)
            .spawn()
            .map_err(|err| format!("failed to open extension folder: {err}"))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(&info.path)
            .spawn()
            .map_err(|err| format!("failed to open extension folder: {err}"))?;
    }
    Ok(info)
}
