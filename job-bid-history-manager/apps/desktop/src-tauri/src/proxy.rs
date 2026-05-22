use axum::{

    body::Body,

    extract::Request,

    http::{header, HeaderMap, Method, StatusCode},

    response::{IntoResponse, Response},

    routing::get,

    Json, Router,

};

use hyper_util::{

    rt::{TokioExecutor, TokioIo},

    server::conn::auto::Builder as ConnBuilder,

    service::TowerToHyperService,

};

use serde_json::json;

use std::net::TcpListener as StdListener;

use std::sync::{Arc, RwLock};

use std::time::{Duration, Instant};

use tokio::time::timeout;

use tower_http::cors::{Any, CorsLayer};



const BIND_TIMEOUT: Duration = Duration::from_secs(3);

const STREAM_FROM_STD_TIMEOUT: Duration = Duration::from_secs(3);

pub(crate) const UPSTREAM_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);

pub(crate) const UPSTREAM_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

pub(crate) const PROBE_TIMEOUT: Duration = Duration::from_secs(12);



// Local proxy port (client .exe). Not 5123 — avoids conflict with other tools on teammate PCs.

pub const DEFAULT_LOCAL_PORT: u16 = 4832;

pub const LOCAL_API_URL: &str = "http://127.0.0.1:4832";



pub type UpstreamStore = Arc<RwLock<Option<String>>>;



#[derive(Clone, Default)]

pub struct ProxyStatus {

    /// Socket bound; accept loop may be starting.

    pub listen_url: Option<String>,

    /// Local GET /health succeeded — UI may send HTTP to `listen_url`.

    pub http_ready: bool,

    /// Last host connectivity probe (None = not probed yet).

    pub host_reachable: Option<bool>,

    pub error: Option<String>,

}



pub type ProxyStatusStore = Arc<RwLock<ProxyStatus>>;



pub fn spawn_proxy(upstream: UpstreamStore, status: ProxyStatusStore) {

    crate::client_log::info("proxy spawn requested");

    let status_on_fail = status.clone();

    match std::thread::Builder::new()

        .name("jbhm-proxy".into())

        .spawn(move || proxy_thread_main(upstream, status))

    {

        Ok(_) => crate::client_log::info("proxy OS thread spawned"),

        Err(err) => {

            let msg = format!("proxy thread spawn failed: {err}");

            crate::client_log::error(&msg);

            if let Ok(mut guard) = status_on_fail.write() {

                guard.error = Some(msg);

            }

        }

    }

}



fn log_upstream_snapshot(upstream: &UpstreamStore) {

    let url = upstream.read().ok().and_then(|g| g.clone());

    crate::client_log::info(format!("proxy upstream snapshot: {:?}", url));

}



fn proxy_thread_main(upstream: UpstreamStore, status: ProxyStatusStore) {

    crate::client_log::info(format!(

        "proxy thread started (id={:?})",

        std::thread::current().id()

    ));

    log_upstream_snapshot(&upstream);

    match crate::proxy_blocking::run(upstream, status.clone()) {

        Ok(()) => crate::client_log::warn("proxy server stopped unexpectedly"),

        Err(err) => {

            crate::client_log::error(format!("proxy failed: {err}"));

            if let Ok(mut guard) = status.write() {

                guard.error = Some(err);

            } else {

                crate::client_log::error("proxy status lock poisoned after failure");

            }

        }

    }

}



fn bind_listener_sync(port: u16) -> Result<StdListener, String> {

    let addr = format!("127.0.0.1:{port}");

    let started = Instant::now();

    crate::client_log::info(format!("proxy trying bind {addr} (sync)"));

    match StdListener::bind(&addr) {

        Ok(listener) => {

            crate::client_log::info(format!(

                "proxy bind ok on port {port} (sync, {}ms)",

                started.elapsed().as_millis()

            ));

            Ok(listener)

        }

        Err(err) => Err(format!("sync bind failed on {port} after {}ms: {err}", started.elapsed().as_millis())),

    }

}



async fn try_tokio_bind(port: u16) -> Result<tokio::net::TcpListener, String> {

    let addr = format!("127.0.0.1:{port}");

    let started = Instant::now();

    crate::client_log::info(format!("proxy trying bind {addr} (tokio)"));

    match timeout(BIND_TIMEOUT, tokio::net::TcpListener::bind(&addr)).await {

        Ok(Ok(listener)) => {

            crate::client_log::info(format!(

                "proxy bind ok on port {port} (tokio, {}ms)",

                started.elapsed().as_millis()

            ));

            Ok(listener)

        }

        Ok(Err(err)) => Err(format!(

            "tokio bind failed on {port} after {}ms: {err}",

            started.elapsed().as_millis()

        )),

        Err(_) => Err(format!(
            "tokio bind timed out on {port} after {}ms",
            started.elapsed().as_millis()
        )),

    }

}



/// Step 1: bound and accept loop starting — UI must not send requests yet.

pub(crate) fn set_proxy_listening(status: &ProxyStatusStore, listen_url: &str) -> Result<(), String> {

    let mut guard = status

        .write()

        .map_err(|_| "proxy status lock poisoned".to_string())?;

    guard.listen_url = Some(listen_url.to_string());

    guard.http_ready = false;

    guard.host_reachable = None;

    guard.error = None;

    Ok(())

}



/// Step 2: local HTTP verified — UI may call `listen_url`.

pub(crate) fn set_proxy_http_ready(status: &ProxyStatusStore) -> Result<(), String> {

    let mut guard = status

        .write()

        .map_err(|_| "proxy status lock poisoned".to_string())?;

    guard.http_ready = true;

    guard.error = None;

    Ok(())

}



pub(crate) fn set_proxy_host_reachable(status: &ProxyStatusStore, reachable: bool) -> Result<(), String> {

    let mut guard = status

        .write()

        .map_err(|_| "proxy status lock poisoned".to_string())?;

    guard.host_reachable = Some(reachable);

    Ok(())

}



/// Verify local proxy serves HTTP, then probe host. Sets `http_ready` before UI should fetch.
fn spawn_connectivity_probe(
    listen_url: &str,
    upstream: UpstreamStore,
    status: ProxyStatusStore,
) {
    let listen_url = listen_url.to_string();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let client = match reqwest::Client::builder()
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
        match client.get(&local).send().await {
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
        match client.get(&target).send().await {
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
    });
}

async fn serve_std_accept_loop(

    listener: Arc<StdListener>,

    app: Router,

    listen_url: &str,

    upstream: UpstreamStore,

    status: ProxyStatusStore,

) -> Result<(), String> {

    crate::client_log::info(format!(

        "proxy accepting HTTP on {listen_url} (std accept loop)"

    ));

    spawn_connectivity_probe(listen_url, upstream, status);

    let service = TowerToHyperService::new(app);

    let builder = ConnBuilder::new(TokioExecutor::new());



    loop {

        let listener = Arc::clone(&listener);

        let (stream, peer) = tokio::task::spawn_blocking(move || listener.accept())

            .await

            .map_err(|e| format!("accept join: {e}"))?

            .map_err(|e| format!("accept: {e}"))?;



        crate::client_log::debug(format!("proxy accepted TCP from {peer}"));

        if let Err(err) = stream.set_nonblocking(true) {

            crate::client_log::warn(format!("stream set_nonblocking ({peer}): {err}"));

            continue;

        }

        let peer_log = peer.to_string();

        let stream = match timeout(

            STREAM_FROM_STD_TIMEOUT,

            tokio::task::spawn_blocking(move || tokio::net::TcpStream::from_std(stream)),

        )

        .await

        {

            Ok(Ok(Ok(stream))) => stream,

            Ok(Ok(Err(err))) => {

                crate::client_log::warn(format!("TcpStream::from_std ({peer_log}): {err}"));

                continue;

            }

            Ok(Err(join_err)) => {

                crate::client_log::warn(format!("TcpStream::from_std join ({peer_log}): {join_err}"));

                continue;

            }

            Err(_) => {

                crate::client_log::warn(format!(

                    "TcpStream::from_std timed out after {}ms from {peer_log} — dropping connection (WebView may hang until refresh)",

                    STREAM_FROM_STD_TIMEOUT.as_millis()

                ));

                continue;

            }

        };



        let io = TokioIo::new(stream);

        let service = service.clone();

        let conn = builder.clone();

        tokio::spawn(async move {

            if let Err(err) = conn.serve_connection(io, service).await {

                crate::client_log::debug(format!("proxy connection ended: {err}"));

            }

        });

    }

}



fn run_proxy_blocking(upstream: UpstreamStore, status: ProxyStatusStore) -> Result<(), String> {

    let rt = tokio::runtime::Builder::new_multi_thread()

        .enable_all()

        .worker_threads(2)

        .thread_name("jbhm-proxy-io")

        .build()

        .map_err(|e| format!("proxy tokio runtime: {e}"))?;



    rt.block_on(run_proxy_async(upstream, status))

}



async fn run_proxy_async(upstream: UpstreamStore, status: ProxyStatusStore) -> Result<(), String> {

    let mut last_err = String::from("no bind attempt");



    for port in DEFAULT_LOCAL_PORT..=DEFAULT_LOCAL_PORT + 7 {

        // 1) sync bind — fast on PCs where tokio::bind hangs

        match bind_listener_sync(port) {
            Ok(std_listener) => {
                let listen_url = format!("http://127.0.0.1:{port}");
                // Skip TcpListener::from_std — hangs on some Windows PCs (J.Miller). Use accept loop like Resume Sender local server.
                set_proxy_listening(&status, &listen_url)?;
                crate::client_log::info(format!(
                    "proxy listening on {listen_url} (http_ready=false until GET /health probe)"
                ));
                let upstream_probe = upstream.clone();
                let status_probe = status.clone();
                let app = build_router(upstream)?;
                return serve_std_accept_loop(
                    Arc::new(std_listener),
                    app,
                    &listen_url,
                    upstream_probe,
                    status_probe,
                )
                .await;
            }

            Err(sync_err) => {

                last_err = sync_err;

                crate::client_log::warn(format!("port {port}: {last_err}"));

            }

        }



        // 2) fallback: pure tokio bind (works on most PCs)

        match try_tokio_bind(port).await {

            Ok(tokio_listener) => {

                let listen_url = format!("http://127.0.0.1:{port}");

                set_proxy_listening(&status, &listen_url)?;

                crate::client_log::info(format!(

                    "proxy accepting HTTP on {listen_url} (tokio bind)"

                ));

                spawn_connectivity_probe(&listen_url, upstream.clone(), status.clone());

                return run_serve_tokio(tokio_listener, upstream, status).await;

            }

            Err(tokio_err) => {

                last_err = tokio_err;

                crate::client_log::warn(format!("port {port}: {last_err}"));

            }

        }

    }



    Err(format!(

        "could not start proxy on ports {}-{}: {last_err}",

        DEFAULT_LOCAL_PORT,

        DEFAULT_LOCAL_PORT + 7

    ))

}



fn build_router(upstream: UpstreamStore) -> Result<Router, String> {

    crate::client_log::info("proxy building HTTP client");

    let client = reqwest::Client::builder()

        .redirect(reqwest::redirect::Policy::limited(5))

        .connect_timeout(UPSTREAM_CONNECT_TIMEOUT)

        .timeout(UPSTREAM_REQUEST_TIMEOUT)

        .build()

        .map_err(|e| format!("failed to create HTTP client: {e}"))?;

    crate::client_log::info("proxy HTTP client ready");



    let state = Arc::new(ProxyState { client, upstream });

    Ok(Router::new()

        .route("/health", get(local_health))

        .fallback(proxy_handler)

        .layer(

            CorsLayer::new()

                .allow_origin(Any)

                .allow_methods(Any)

                .allow_headers(Any),

        )

        .with_state(state))

}



async fn run_serve_tokio(

    listener: tokio::net::TcpListener,

    upstream: UpstreamStore,

    _status: ProxyStatusStore,

) -> Result<(), String> {

    let app = build_router(upstream)?;

    axum::serve(listener, app)

        .await

        .map_err(|e| format!("proxy server error: {e}"))

}



/// Instant response on localhost — does not forward.

async fn local_health(

    axum::extract::State(state): axum::extract::State<Arc<ProxyState>>,

) -> Json<serde_json::Value> {

    crate::client_log::debug("proxy local GET /health (no forward)");

    let upstream = state

        .upstream

        .read()

        .ok()

        .and_then(|guard| guard.clone());

    Json(json!({

        "status": "ok",

        "proxy": true,

        "local": true,

        "upstream": upstream,

    }))

}



struct ProxyState {

    client: reqwest::Client,

    upstream: UpstreamStore,

}



async fn proxy_handler(

    axum::extract::State(state): axum::extract::State<Arc<ProxyState>>,

    req: Request,

) -> Response {

    let method = req.method().clone();

    let path = req

        .uri()

        .path_and_query()

        .map(|pq| pq.as_str())

        .unwrap_or("/")

        .to_string();

    crate::client_log::info(format!("proxy inbound {method} {path}"));

    let started = Instant::now();

    match forward_request(&state, req).await {

        Ok(response) => {

            crate::client_log::info(format!(

                "proxy forward ok {method} {path} -> status={} ({}ms)",

                response.status(),

                started.elapsed().as_millis()

            ));

            response

        }

        Err(message) => {

            crate::client_log::warn(format!(

                "proxy forward failed {method} {path} after {}ms: {message}",

                started.elapsed().as_millis()

            ));

            (StatusCode::BAD_GATEWAY, message).into_response()

        }

    }

}



async fn forward_request(state: &ProxyState, req: Request) -> Result<Response, String> {

    if req.method() == Method::OPTIONS {

        return Ok(Response::builder()

            .status(StatusCode::NO_CONTENT)

            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")

            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET,POST,PUT,PATCH,DELETE,OPTIONS")

            .header(

                header::ACCESS_CONTROL_ALLOW_HEADERS,

                "Content-Type, Authorization",

            )

            .body(Body::empty())

            .map_err(|e| format!("failed to build OPTIONS response: {e}"))?);

    }



    let upstream = state

        .upstream

        .read()

        .map_err(|_| "proxy state unavailable".to_string())?

        .clone()

        .ok_or_else(|| {

            "Host server not configured. Open Host Server in the app and enter your host PC address."

                .to_string()

        })?;



    let (parts, body) = req.into_parts();

    let path_and_query = parts

        .uri

        .path_and_query()

        .map(|pq| pq.as_str())

        .unwrap_or("/");

    let target = format!("{upstream}{path_and_query}");

    let method = parts.method.clone();

    crate::client_log::debug(format!("proxy upstream request: {method} {target}"));



    let body_bytes = axum::body::to_bytes(body, 52 * 1024 * 1024)

        .await

        .map_err(|e| format!("failed to read request body: {e}"))?;



    let mut request_builder = state.client.request(method.clone(), &target);



    for (name, value) in parts.headers.iter() {

        if name == header::HOST || name == header::CONNECTION {

            continue;

        }

        request_builder = request_builder.header(name, value);

    }



    if !body_bytes.is_empty() || method == Method::POST || method == Method::PUT || method == Method::PATCH

    {

        request_builder = request_builder.body(body_bytes.to_vec());

    }



    let upstream_response = request_builder

        .send()

        .await

        .map_err(|e| format!("Cannot reach host server at {upstream}: {e}"))?;



    let status =

        StatusCode::from_u16(upstream_response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);

    let mut response_headers = HeaderMap::new();

    for (name, value) in upstream_response.headers().iter() {

        response_headers.insert(name.clone(), value.clone());

    }



    let bytes = upstream_response

        .bytes()

        .await

        .map_err(|e| format!("failed to read host response: {e}"))?;



    crate::client_log::debug(format!(

        "proxy upstream response: {method} {path_and_query} status={status} bytes={}",

        bytes.len()

    ));



    let mut builder = Response::builder().status(status);

    for (name, value) in response_headers.iter() {

        builder = builder.header(name, value);

    }

    builder

        .body(Body::from(bytes))

        .map_err(|e| format!("failed to build response: {e}"))

}


