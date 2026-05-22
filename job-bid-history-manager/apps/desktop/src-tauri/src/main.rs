// Host release: no console. Client release: no console unless JBHM_CLIENT_CONSOLE=1 (see attach_debug_console).
#![cfg_attr(all(not(debug_assertions), not(feature = "client")), windows_subsystem = "windows")]

/// Reduce WebView2 GPU crashes on some Windows PCs (must run before the webview starts).
#[cfg(feature = "client")]
fn apply_webview_stability_env() {
    let mut args = String::from("--disable-gpu --disable-gpu-compositing --disable-breakpad");
    if std::env::var_os("JBHM_CLIENT_CONSOLE").is_some() {
        args.push_str(" --disable-features=RendererCodeIntegrity");
    }
    let _ = std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args);
}

/// Release client .exe is a GUI app — `eprintln!` is invisible unless a console exists.
/// On Miller's PC, run: `set JBHM_CLIENT_CONSOLE=1` then start the .exe from cmd to see live errors.
#[cfg(all(windows, feature = "client"))]
fn attach_debug_console() {
    if std::env::var_os("JBHM_CLIENT_CONSOLE").is_none() {
        return;
    }
    unsafe {
        windows_sys::Win32::System::Console::AllocConsole();
    }
    eprintln!("JBHM client: debug console attached (JBHM_CLIENT_CONSOLE=1)");
    eprintln!("Log file: %LOCALAPPDATA%\\com.jbhm.desktop.client\\logs\\jbhm-client.log");
}

fn main() {
    #[cfg(feature = "client")]
    apply_webview_stability_env();
    #[cfg(all(windows, feature = "client"))]
    attach_debug_console();
    jbhm_desktop_lib::run()
}
