use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    Router,
};
use std::sync::{Arc, RwLock};
use tower_http::cors::{Any, CorsLayer};

pub const LOCAL_API_URL: &str = "http://127.0.0.1:5123";
const LISTEN_ADDR: &str = "127.0.0.1:5123";

pub type UpstreamStore = Arc<RwLock<Option<String>>>;

pub fn spawn_proxy(upstream: UpstreamStore) {
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(err) => {
                eprintln!("jbhm proxy: failed to start runtime: {err}");
                return;
            }
        };
        runtime.block_on(async move {
            if let Err(err) = run_proxy(upstream).await {
                eprintln!("jbhm proxy: {err}");
            }
        });
    });
}

async fn run_proxy(upstream: UpstreamStore) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("failed to create HTTP client: {e}"))?;

    let state = Arc::new(ProxyState { client, upstream });

    let app = Router::new()
        .fallback(proxy_handler)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(LISTEN_ADDR)
        .await
        .map_err(|e| format!("failed to bind local proxy on {LISTEN_ADDR}: {e}"))?;

    eprintln!("jbhm proxy: listening on {LISTEN_ADDR}");
    axum::serve(listener, app)
        .await
        .map_err(|e| format!("proxy server error: {e}"))
}

struct ProxyState {
    client: reqwest::Client,
    upstream: UpstreamStore,
}

async fn proxy_handler(
    axum::extract::State(state): axum::extract::State<Arc<ProxyState>>,
    req: Request,
) -> Response {
    match forward_request(&state, req).await {
        Ok(response) => response,
        Err(message) => (StatusCode::BAD_GATEWAY, message).into_response(),
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
            "Host server not configured. Open API Host in the app and enter your host PC address."
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

    if !body_bytes.is_empty() || method == Method::POST || method == Method::PUT || method == Method::PATCH {
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
        response_headers.insert(name, value.clone());
    }

    let bytes = upstream_response
        .bytes()
        .await
        .map_err(|e| format!("failed to read host response: {e}"))?;

    let mut builder = Response::builder().status(status);
    for (name, value) in response_headers.iter() {
        builder = builder.header(name, value);
    }
    builder
        .body(Body::from(bytes))
        .map_err(|e| format!("failed to build response: {e}"))
}
