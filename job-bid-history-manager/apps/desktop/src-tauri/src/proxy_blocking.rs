//! Blocking local HTTP proxy (std + rouille + reqwest::blocking).
//! Avoids `tokio::net::TcpStream::from_std` on accepted sockets — hangs/crashes on some Windows PCs.

use crate::proxy::{
    set_proxy_host_reachable, set_proxy_http_ready, set_proxy_listening, UpstreamStore,
    ProxyStatusStore, DEFAULT_LOCAL_PORT, UPSTREAM_CONNECT_TIMEOUT, UPSTREAM_REQUEST_TIMEOUT,
    PROBE_TIMEOUT,
};
use rouille::{Request, Response};
use std::io::Read;
use std::path::{Path, PathBuf};
use serde_json::json;
use std::fs;
use std::net::TcpListener;
use std::sync::Arc;
use std::time::{Duration, Instant};

struct BlockingState {
    client: reqwest::blocking::Client,
    upstream: UpstreamStore,
    status: ProxyStatusStore,
    static_root: Option<Arc<PathBuf>>,
}

/// Tauri desktop client — API proxy only (UI in WebView).
pub fn run(upstream: UpstreamStore, status: ProxyStatusStore) -> Result<(), String> {
    run_internal(upstream, status, None)
}

/// Astrill-safe mode: proxy + built UI on :4832; open in Chrome (no WebView2 / no ASProxy crash in UI process).
pub fn run_browser_mode(
    upstream: UpstreamStore,
    status: ProxyStatusStore,
    static_root: PathBuf,
) -> Result<(), String> {
    if !static_root.join("index.html").exists() {
        return Err(format!(
            "UI files missing at {} (index.html not found). Reinstall the client.",
            static_root.display()
        ));
    }
    crate::client_log::info(format!(
        "browser mode: serving UI from {}",
        static_root.display()
    ));
    run_internal(upstream, status, Some(Arc::new(static_root)))
}

fn run_internal(
    upstream: UpstreamStore,
    status: ProxyStatusStore,
    static_root: Option<Arc<PathBuf>>,
) -> Result<(), String> {
    let mut last_err = String::from("no bind attempt");

    for port in DEFAULT_LOCAL_PORT..=DEFAULT_LOCAL_PORT + 7 {
        let addr = format!("127.0.0.1:{port}");
        match TcpListener::bind(&addr) {
            Ok(listener) => {
                drop(listener);
                let listen_url = format!("http://127.0.0.1:{port}");
                set_proxy_listening(&status, &listen_url)?;
                crate::client_log::info(format!(
                    "proxy bind ok on port {port} (blocking server); http_ready=false until probe"
                ));

                let client = reqwest::blocking::Client::builder()
                    .redirect(reqwest::redirect::Policy::limited(5))
                    .connect_timeout(UPSTREAM_CONNECT_TIMEOUT)
                    .timeout(UPSTREAM_REQUEST_TIMEOUT)
                    .build()
                    .map_err(|e| format!("blocking HTTP client: {e}"))?;

                let state = Arc::new(BlockingState {
                    client,
                    upstream: upstream.clone(),
                    status: status.clone(),
                    static_root: static_root.clone(),
                });

                spawn_blocking_probe(listen_url.clone(), upstream, status.clone());

                crate::client_log::info(format!(
                    "proxy accepting HTTP on {listen_url} (blocking rouille — no tokio from_std)"
                ));

                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<(), String> {
                    let server = rouille::Server::new(("127.0.0.1", port), move |request| {
                        handle_request_panic_safe(request, &state)
                    })
                    .map_err(|e| format!("rouille server: {e}"))?;
                    server.run();
                    Ok(())
                }));

                return match result {
                    Ok(inner) => inner,
                    Err(_) => {
                        crate::client_log::error("proxy rouille server panicked");
                        Err("proxy server panicked".to_string())
                    }
                };
            }
            Err(e) => {
                last_err = format!("bind {addr}: {e}");
                crate::client_log::warn(&last_err);
            }
        }
    }

    Err(format!(
        "could not start blocking proxy on ports {}-{}: {last_err}",
        DEFAULT_LOCAL_PORT,
        DEFAULT_LOCAL_PORT + 7
    ))
}

fn spawn_blocking_probe(listen_url: String, upstream: UpstreamStore, status: ProxyStatusStore) {
    std::thread::Builder::new()
        .name("jbhm-probe".into())
        .spawn(move || {
            crate::client_log::info("connectivity probe thread started");
            std::thread::sleep(Duration::from_millis(150));
            let client = match reqwest::blocking::Client::builder()
                .connect_timeout(UPSTREAM_CONNECT_TIMEOUT)
                .timeout(PROBE_TIMEOUT)
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    crate::client_log::warn(format!("connectivity probe: build client failed: {e}"));
                    return;
                }
            };

            let local = format!("{listen_url}/health");
            let t0 = Instant::now();
            match client.get(&local).send() {
                Ok(res) if res.status().is_success() => {
                    let _ = set_proxy_http_ready(&status);
                    crate::client_log::info(format!(
                        "local proxy HTTP ready at {listen_url} (GET /health {} in {}ms) — UI may send requests",
                        res.status(),
                        t0.elapsed().as_millis()
                    ));
                }
                Ok(res) => {
                    crate::client_log::warn(format!(
                        "connectivity probe: local GET /health unexpected {} ({}ms)",
                        res.status(),
                        t0.elapsed().as_millis()
                    ));
                }
                Err(e) => {
                    crate::client_log::warn(format!(
                        "connectivity probe: local GET /health failed ({}ms): {e}",
                        t0.elapsed().as_millis()
                    ));
                }
            }

            let host = upstream.read().ok().and_then(|g| g.clone());
            let Some(host) = host else {
                crate::client_log::warn("connectivity probe: no upstream URL configured");
                return;
            };
            let target = format!("{host}/health");
            let t1 = Instant::now();
            match client.get(&target).send() {
                Ok(res) if res.status().is_success() => {
                    let _ = set_proxy_host_reachable(&status, true);
                    crate::client_log::info(format!(
                        "connectivity probe: host GET /health -> {} ({}ms)",
                        res.status(),
                        t1.elapsed().as_millis()
                    ));
                }
                Ok(res) => {
                    let _ = set_proxy_host_reachable(&status, false);
                    crate::client_log::warn(format!(
                        "connectivity probe: host GET /health unexpected {} ({}ms)",
                        res.status(),
                        t1.elapsed().as_millis()
                    ));
                }
                Err(e) => {
                    let _ = set_proxy_host_reachable(&status, false);
                    crate::client_log::warn(format!(
                        "connectivity probe: host GET /health failed ({}ms): {e}",
                        t1.elapsed().as_millis()
                    ));
                }
            }
        })
        .ok();
}

fn handle_request_panic_safe(request: &Request, state: &BlockingState) -> Response {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handle_request(request, state))) {
        Ok(response) => response,
        Err(_) => {
            crate::client_log::error(format!(
                "proxy handler panicked on {} {}",
                request.method(),
                request.raw_url()
            ));
            Response::text("Internal proxy error").with_status_code(500)
        }
    }
}

fn is_api_path(path: &str) -> bool {
    let path = path.split('?').next().unwrap_or(path);
    path.starts_with("/jobs")
        || path.starts_with("/tags")
        || path.starts_with("/analytics")
        || path.starts_with("/capture")
        || path.starts_with("/resumes")
        || path.starts_with("/settings")
        || path.starts_with("/demo")
        || path.starts_with("/sample")
        || path.starts_with("/ollama")
        || path.starts_with("/extract")
}

fn handle_request(request: &Request, state: &BlockingState) -> Response {
    if request.method() == "OPTIONS" {
        return cors_options();
    }

    let path = request.raw_url();
    let path_only = path.split('?').next().unwrap_or(path);

    if request.method() == "GET" && path_only == "/client/info" {
        return cors(Response::json(&client_info_json(state)));
    }

    if request.method() == "POST" && path_only == "/client/upstream" {
        return cors(handle_set_upstream(request, state));
    }

    if request.method() == "GET" && path_only == "/client/extension" {
        return cors(match crate::extension_install::ensure_standalone() {
            Ok(info) => Response::json(&info),
            Err(e) => Response::text(e).with_status_code(500),
        });
    }

    if request.method() == "POST" && path_only == "/client/extension/open" {
        return cors(match crate::extension_install::open_standalone_folder() {
            Ok(info) => Response::json(&info),
            Err(e) => Response::text(e).with_status_code(500),
        });
    }

    if request.method() == "GET" && path_only == "/health" {
        crate::client_log::debug("proxy local GET /health (blocking, no forward)");
        let upstream = state
            .upstream
            .read()
            .ok()
            .and_then(|g| g.clone());
        let body = json!({
            "status": "ok",
            "proxy": true,
            "local": true,
            "upstream": upstream,
        });
        return cors(Response::json(&body));
    }

    if request.method() == "GET" {
        if let Some(ref root) = state.static_root {
            if !is_api_path(path_only) {
                if let Some(resp) = serve_static(path_only, root) {
                    return cors(resp);
                }
            }
        }
    }

    let started = Instant::now();
    match forward_blocking(request, state) {
        Ok(response) => {
            crate::client_log::info(format!(
                "proxy forward ok {} {} -> status={} ({}ms)",
                request.method(),
                path,
                response.status_code,
                started.elapsed().as_millis()
            ));
            cors(response)
        }
        Err(message) => {
            crate::client_log::warn(format!(
                "proxy forward failed {} {} after {}ms: {message}",
                request.method(),
                path,
                started.elapsed().as_millis()
            ));
            cors(Response::text(message).with_status_code(502))
        }
    }
}

fn forward_blocking(request: &Request, state: &BlockingState) -> Result<Response, String> {
    let upstream = state
        .upstream
        .read()
        .map_err(|_| "proxy state unavailable".to_string())?
        .clone()
        .ok_or_else(|| {
            "Host server not configured. Open Host Server in the app and enter your host PC address."
                .to_string()
        })?;

    let path_and_query = request.raw_url();
    let target = format!("{upstream}{path_and_query}");
    crate::client_log::info(format!(
        "proxy inbound {} {}",
        request.method(),
        path_and_query
    ));
    crate::client_log::debug(format!("proxy upstream request: {} {target}", request.method()));

    let method = reqwest_method(request.method())?;
    let mut rb = state.client.request(method, &target);

    for (name, value) in request.headers() {
        if name.eq_ignore_ascii_case("host") || name.eq_ignore_ascii_case("connection") {
            continue;
        }
        rb = rb.header(name, value);
    }

    let body = read_request_body(request);
    if !body.is_empty()
        || matches!(request.method(), "POST" | "PUT" | "PATCH")
    {
        rb = rb.body(body);
    }

    let upstream_response = rb
        .send()
        .map_err(|e| format!("Cannot reach host server at {upstream}: {e}"))?;

    let status = upstream_response.status().as_u16();
    let mut response_headers: Vec<(String, String)> = Vec::new();
    for (name, value) in upstream_response.headers() {
        if let Ok(v) = value.to_str() {
            response_headers.push((name.to_string(), v.to_string()));
        }
    }
    let bytes = upstream_response
        .bytes()
        .map_err(|e| format!("failed to read upstream body: {e}"))?;

    let mut response =
        Response::from_data("application/octet-stream", bytes.as_ref().to_vec()).with_status_code(status);
    for (name, value) in response_headers {
        if name.eq_ignore_ascii_case("access-control-allow-origin") {
            continue;
        }
        response = response.with_additional_header(name, value);
    }
    Ok(response)
}

fn reqwest_method(method: &str) -> Result<reqwest::Method, String> {
    reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| format!("unsupported method: {method}"))
}

fn read_request_body(request: &Request) -> Vec<u8> {
    let mut body = Vec::new();
    if let Some(mut reader) = request.data() {
        let _ = reader.read_to_end(&mut body);
    }
    body
}

fn cors_options() -> Response {
    Response::empty_204()
        .with_additional_header("Access-Control-Allow-Origin", "*")
        .with_additional_header(
            "Access-Control-Allow-Methods",
            "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        )
        .with_additional_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

fn cors(mut response: Response) -> Response {
    response = response.with_additional_header("Access-Control-Allow-Origin", "*");
    response
}

fn client_info_json(state: &BlockingState) -> serde_json::Value {
    let info = crate::read_client_info_for_proxy(&state.upstream, &state.status);
    serde_json::to_value(info).unwrap_or(json!({}))
}

fn handle_set_upstream(request: &Request, state: &BlockingState) -> Response {
    let body = read_request_body(request);
    let parsed: Result<serde_json::Value, _> = serde_json::from_slice(&body);
    let url = match parsed {
        Ok(v) => v
            .get("url")
            .and_then(|u| u.as_str())
            .map(|s| s.to_string()),
        Err(_) => None,
    };
    let Some(url) = url else {
        return Response::text("Expected JSON body: { \"url\": \"http://host:5123\" }")
            .with_status_code(400);
    };
    match crate::client_config::normalize_upstream_url(&url) {
        Ok(normalized) => {
            if let Ok(mut guard) = state.upstream.write() {
                *guard = Some(normalized.clone());
            }
            let cfg = crate::client_config::ClientConfigFile {
                upstream_url: Some(normalized),
            };
            if let Err(e) = crate::client_config::save_standalone(&cfg) {
                return Response::text(e).with_status_code(500);
            }
            let info = crate::read_client_info_for_proxy(&state.upstream, &state.status);
            Response::json(&info)
        }
        Err(e) => Response::text(e).with_status_code(400),
    }
}

fn serve_static(path_only: &str, root: &Path) -> Option<Response> {
    let rel = path_only.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    let mut file_path = root.join(rel);
    if file_path.is_dir() {
        file_path = root.join("index.html");
    }
    if !file_path.starts_with(root) {
        return None;
    }
    if !file_path.exists() && !rel.contains('.') {
        file_path = root.join("index.html");
    }
    if !file_path.exists() {
        return None;
    }
    let bytes = fs::read(&file_path).ok()?;
    let mime = mime_for_path(&file_path);
    Some(Response::from_data(mime, bytes))
}

fn mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("js") => "application/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("png") => "image/png",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        _ => "application/octet-stream",
    }
}
