use std::{

    fs::{self, OpenOptions},

    io::Write,

    panic,

    path::PathBuf,

    sync::Mutex,

    time::{Instant, SystemTime, UNIX_EPOCH},

};

use tauri::Manager;



static LOG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

static SESSION_START: Mutex<Option<Instant>> = Mutex::new(None);



fn timestamp() -> String {

    let dur = SystemTime::now()

        .duration_since(UNIX_EPOCH)

        .unwrap_or_default();

    format!("{}.{:03}", dur.as_secs(), dur.subsec_millis())

}



fn elapsed_tag() -> String {

    let guard = SESSION_START.lock().ok();

    let Some(start) = guard.as_ref().and_then(|g| g.as_ref()) else {

        return String::new();

    };

    let ms = start.elapsed().as_millis();

    format!(" +{ms}ms")

}



fn append_line(path: &PathBuf, level: &str, message: &str) {

    let line = format!(

        "[{}] [{level}] {message}{}\n",

        timestamp(),

        elapsed_tag()

    );

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
        let _ = file.sync_all();
    }

}



fn write_log(level: &str, message: impl AsRef<str>) {

    let message = message.as_ref();

    match level {

        "ERROR" => eprintln!("jbhm ERROR: {message}"),

        "WARN" => eprintln!("jbhm WARN: {message}"),

        "DEBUG" => eprintln!("jbhm DEBUG: {message}"),

        _ => eprintln!("jbhm: {message}"),

    }

    if let Ok(guard) = LOG_FILE.lock() {

        if let Some(ref path) = *guard {

            append_line(path, level, message);

        }

    }

}



/// Browser-mode gateway (no Tauri) — same log file as the desktop client.
#[cfg(feature = "client")]
pub fn init_standalone() -> Result<PathBuf, String> {
    let dir = std::env::var("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("com.jbhm.desktop.client").join("logs"))
        .unwrap_or_else(|_| PathBuf::from("logs"));
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create log directory: {e}"))?;
    let path = dir.join("jbhm-client.log");
    {
        let mut guard = LOG_FILE
            .lock()
            .map_err(|_| "log file lock poisoned".to_string())?;
        *guard = Some(path.clone());
    }
    if let Ok(mut start) = SESSION_START.lock() {
        *start = Some(Instant::now());
    }
    let _ = fs::write(
        &path,
        format!("\n--- session start {} (browser mode) ---\n", timestamp()),
    );
    info("Job Bid History Manager (browser mode / gateway) starting");
    info(format!("log file: {}", path.display()));
    Ok(path)
}

pub fn log_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {

    let dir = app

        .path()

        .app_log_dir()

        .or_else(|_| app.path().app_data_dir())

        .map_err(|e| format!("failed to resolve log directory: {e}"))?;

    fs::create_dir_all(&dir).map_err(|e| format!("failed to create log directory: {e}"))?;

    Ok(dir.join("jbhm-client.log"))

}



pub fn init(app: &tauri::AppHandle) -> Result<PathBuf, String> {

    let path = log_file_path(app)?;

    {

        let mut guard = LOG_FILE

            .lock()

            .map_err(|_| "log file lock poisoned".to_string())?;

        *guard = Some(path.clone());

    }

    if let Ok(mut start) = SESSION_START.lock() {

        *start = Some(Instant::now());

    }



    let _ = fs::write(

        &path,

        format!("\n--- session start {} ---\n", timestamp()),

    );



    info(format!(

        "Job Bid History Manager (client) starting — version {} build client",

        env!("CARGO_PKG_VERSION")

    ));

    info(format!("log file: {}", path.display()));

    if let Ok(config_dir) = app.path().app_config_dir() {

        info(format!("config dir: {}", config_dir.display()));

    }



    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |info| {

        if let Ok(guard) = LOG_FILE.lock() {

            if let Some(ref log_path) = *guard {

                let msg = format!("{info}");

                append_line(log_path, "PANIC", &msg);

                if let Some(loc) = info.location() {

                    append_line(

                        log_path,

                        "PANIC",

                        &format!("at {}:{}:{}", loc.file(), loc.line(), loc.column()),

                    );

                }

            }

        }

        default_hook(info);

    }));



    Ok(path)

}



pub fn info(message: impl AsRef<str>) {

    write_log("INFO", message);

}



pub fn error(message: impl AsRef<str>) {

    write_log("ERROR", message);

}



pub fn warn(message: impl AsRef<str>) {

    write_log("WARN", message);

}



pub fn debug(message: impl AsRef<str>) {

    write_log("DEBUG", message);

}


