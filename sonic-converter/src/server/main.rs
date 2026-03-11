#[cfg(feature = "server")]
mod db;
#[cfg(feature = "server")]
mod webhook;

/// Sonic Converter API Server — hardened REST API for MP3 → WAV conversion.
///
/// Security layers:
///   1. Strict CORS (allowlisted origins only)
///   2. API key authentication (x-api-key or Authorization: Bearer header)
///   3. Per-tier file size + bit depth enforcement
///   4. Streaming multipart → temp file (bounded memory)
///   5. In-process rate limiting per API key (governor)
///   6. Security headers on all responses
///   7. Structured logging with request IDs

#[cfg(feature = "server")]
use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
#[cfg(feature = "server")]
use dashmap::DashMap;
#[cfg(feature = "server")]
use governor::{Quota, RateLimiter};
#[cfg(feature = "server")]
use serde_json::json;
#[cfg(feature = "server")]
use std::collections::HashMap;
#[cfg(feature = "server")]
use std::num::NonZeroU32;
#[cfg(feature = "server")]
use std::sync::Arc;
#[cfg(feature = "server")]
use std::time::Instant;
#[cfg(feature = "server")]
use tokio::io::AsyncWriteExt;
#[cfg(feature = "server")]
use tokio_util::io::ReaderStream;
#[cfg(feature = "server")]
use tower_http::cors::CorsLayer;
#[cfg(feature = "server")]
use tower_http::limit::RequestBodyLimitLayer;
#[cfg(feature = "server")]
use chrono::Datelike;
use tracing::{error, info, warn};

/// Wrapper to pass the raw API key through request extensions.
#[cfg(feature = "server")]
#[derive(Clone)]
struct ApiKey(String);

// ---------------------------------------------------------------------------
// Subscription tiers
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
#[derive(Clone, Debug, PartialEq, Eq)]
enum Tier {
    Free,
    Pro,
    Business,
    Unlimited,
}

#[cfg(feature = "server")]
impl Tier {
    fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "free" => Some(Tier::Free),
            "pro" => Some(Tier::Pro),
            "business" => Some(Tier::Business),
            "unlimited" => Some(Tier::Unlimited),
            _ => None,
        }
    }

    /// Maximum upload size in bytes for this tier.
    fn max_file_size(&self) -> u64 {
        match self {
            Tier::Free => 100 * 1024 * 1024,           // 100 MB
            Tier::Pro => 500 * 1024 * 1024,             // 500 MB
            Tier::Business => 2 * 1024 * 1024 * 1024,   // 2 GB
            Tier::Unlimited => 5 * 1024 * 1024 * 1024,   // 5 GB
        }
    }

    /// Human-readable file size limit.
    fn max_file_size_label(&self) -> &'static str {
        match self {
            Tier::Free => "100 MB",
            Tier::Pro => "500 MB",
            Tier::Business => "2 GB",
            Tier::Unlimited => "5 GB",
        }
    }

    /// Allowed bit depths for this tier.
    fn allowed_bit_depths(&self) -> &'static [u8] {
        match self {
            Tier::Free => &[16],
            Tier::Pro => &[16, 24],
            Tier::Business | Tier::Unlimited => &[16, 24, 32],
        }
    }

    fn name(&self) -> &'static str {
        match self {
            Tier::Free => "Free",
            Tier::Pro => "Pro",
            Tier::Business => "Business",
            Tier::Unlimited => "Unlimited",
        }
    }

    /// Requests per minute allowed for this tier.
    fn requests_per_minute(&self) -> u32 {
        match self {
            Tier::Free => 10,
            Tier::Pro => 50,
            Tier::Business => 200,
            Tier::Unlimited => 500,
        }
    }

    /// Monthly conversion limit (None = unlimited).
    fn monthly_limit(&self) -> Option<u32> {
        match self {
            Tier::Free => Some(500),
            Tier::Pro => Some(5000),
            Tier::Business => Some(25000),
            Tier::Unlimited => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Rate limiter (per API key)
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
type KeyRateLimiter = RateLimiter<
    governor::state::NotKeyed,
    governor::state::InMemoryState,
    governor::clock::DefaultClock,
>;

#[cfg(feature = "server")]
#[derive(Clone)]
struct RateLimiterMap {
    limiters: Arc<DashMap<String, Arc<KeyRateLimiter>>>,
}

#[cfg(feature = "server")]
impl RateLimiterMap {
    fn new() -> Self {
        Self {
            limiters: Arc::new(DashMap::new()),
        }
    }

    fn check(&self, key: &str, tier: &Tier) -> Result<(), ()> {
        let limiter = self
            .limiters
            .entry(key.to_string())
            .or_insert_with(|| {
                let rpm = tier.requests_per_minute();
                let quota = Quota::per_minute(NonZeroU32::new(rpm).unwrap());
                Arc::new(RateLimiter::direct(quota))
            })
            .clone();

        limiter.check().map_err(|_| ())
    }
}

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
#[derive(Clone)]
struct AppState {
    /// Maps API key → tier. Loaded from SONIC_API_KEYS env var (JSON object)
    /// or falls back to single SONIC_API_KEY as Free tier.
    api_keys: HashMap<String, Tier>,
    /// Per-key rate limiters.
    rate_limiters: RateLimiterMap,
    /// Database connection (optional — if not configured, quotas are not enforced).
    database: Option<db::Database>,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
#[tokio::main]
async fn main() {
    // --- Structured logging ------------------------------------------------
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .json()
        .init();

    // --- API keys (tier-based) ---------------------------------------------
    let api_keys: HashMap<String, Tier> = if let Ok(json_str) = std::env::var("SONIC_API_KEYS") {
        let raw: HashMap<String, String> = serde_json::from_str(&json_str).unwrap_or_else(|e| {
            error!("Failed to parse SONIC_API_KEYS JSON: {e}");
            std::process::exit(1);
        });
        raw.into_iter()
            .filter_map(|(key, tier_str)| {
                Tier::from_str(&tier_str).map(|tier| {
                    info!(key_suffix = &key[key.len().saturating_sub(6)..], tier = tier.name(), "Loaded API key");
                    (key, tier)
                })
            })
            .collect()
    } else {
        let key = std::env::var("SONIC_API_KEY").unwrap_or_else(|_| {
            warn!("SONIC_API_KEY not set — using default dev key. DO NOT use in production.");
            "sonic-dev-key-DO-NOT-USE-IN-PRODUCTION".to_string()
        });
        let mut map = HashMap::new();
        map.insert(key, Tier::Free);
        map
    };

    info!(count = api_keys.len(), "API keys loaded");

    // --- CORS (strict) -----------------------------------------------------
    let allowed_origins_raw = std::env::var("SONIC_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "https://mp3towav.online,https://www.mp3towav.online,http://localhost:3000".to_string());

    let origins: Vec<header::HeaderValue> = allowed_origins_raw
        .split(',')
        .filter_map(|o| o.trim().parse().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::HeaderName::from_static("x-api-key"),
        ]);

    // --- Database (optional) ------------------------------------------------
    let database = match (std::env::var("TURSO_URL"), std::env::var("TURSO_AUTH_TOKEN")) {
        (Ok(url), Ok(token)) => {
            match db::Database::connect(&url, &token).await {
                Ok(database) => {
                    info!("Connected to Turso database");

                    // Migrate env-var keys into the database (idempotent)
                    let env_keys: HashMap<String, String> = api_keys
                        .iter()
                        .map(|(k, v)| (k.clone(), v.name().to_lowercase()))
                        .collect();
                    if let Err(e) = database.migrate_env_keys(&env_keys).await {
                        warn!(error = %e, "Failed to migrate env keys to database");
                    }

                    Some(database)
                }
                Err(e) => {
                    warn!(error = %e, "Failed to connect to Turso — running without database (quotas disabled)");
                    None
                }
            }
        }
        _ => {
            // Try local SQLite for development
            match std::env::var("SONIC_DB_PATH") {
                Ok(path) => {
                    match db::Database::connect_local(&path).await {
                        Ok(database) => {
                            info!(path = %path, "Connected to local SQLite database");
                            Some(database)
                        }
                        Err(e) => {
                            warn!(error = %e, "Failed to open local DB — running without database");
                            None
                        }
                    }
                }
                Err(_) => {
                    info!("No database configured (set TURSO_URL + TURSO_AUTH_TOKEN or SONIC_DB_PATH)");
                    None
                }
            }
        }
    };

    let state = AppState {
        api_keys,
        rate_limiters: RateLimiterMap::new(),
        database,
    };

    // --- Router ------------------------------------------------------------
    let protected = Router::new()
        .route("/convert", post(convert_handler))
        .route("/info", post(info_handler))
        .route("/usage", get(usage_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    let app = Router::new()
        .route("/", get(health))
        .route("/health", get(health))
        .route("/v1/status", get(status_handler))
        .nest("/v1", protected)
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(5 * 1024 * 1024 * 1024)) // 5 GB (max tier)
        .with_state(state);

    let addr = std::env::var("SONIC_ADDR").or_else(|_| {
        std::env::var("PORT").map(|p| format!("0.0.0.0:{p}"))
    }).unwrap_or_else(|_| "0.0.0.0:3001".to_string());

    info!(addr = %addr, cors = %allowed_origins_raw, "Sonic Converter API starting");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}

#[cfg(not(feature = "server"))]
fn main() {
    eprintln!("Server feature not enabled. Build with: cargo run --features server");
    std::process::exit(1);
}

// ---------------------------------------------------------------------------
// Middleware: Security headers on all responses
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
async fn security_headers_middleware(
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let request_id = uuid::Uuid::new_v4().to_string();
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    headers.insert("X-Request-Id", HeaderValue::from_str(&request_id).unwrap());
    headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    headers.insert("Strict-Transport-Security", HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"));
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert("Referrer-Policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    headers.insert("Permissions-Policy", HeaderValue::from_static("camera=(), microphone=(), geolocation=()"));

    response
}

// ---------------------------------------------------------------------------
// Middleware: API key authentication + rate limiting
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
async fn auth_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut request: axum::extract::Request,
    next: Next,
) -> Response {
    // Accept API key from x-api-key header or Authorization: Bearer header
    let key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|k| k.to_string())
        .or_else(|| {
            headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(|k| k.to_string())
        });

    let key = match key {
        Some(k) => k,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "unauthorized",
                    "message": "Missing API key. Provide via x-api-key header or Authorization: Bearer header.",
                    "status": 401
                })),
            )
                .into_response();
        }
    };

    match state.api_keys.get(&key) {
        Some(tier) => {
            // Rate limiting per API key
            if let Err(_retry_after) = state.rate_limiters.check(&key, tier) {
                let key_suffix = &key[key.len().saturating_sub(6)..];
                warn!(key_suffix, tier = tier.name(), "Rate limit exceeded");
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "error": "rate_limited",
                        "message": format!(
                            "Rate limit exceeded. Your {} plan allows {} requests/minute.",
                            tier.name(),
                            tier.requests_per_minute()
                        ),
                        "limit_per_minute": tier.requests_per_minute(),
                        "status": 429
                    })),
                )
                    .into_response();
            }

            // Monthly quota enforcement (if database is available)
            if let Some(ref db) = state.database {
                if let Some(limit) = tier.monthly_limit() {
                    match db.get_monthly_usage(&key).await {
                        Ok(usage) => {
                            if usage.conversion_count >= limit {
                                let next_month = {
                                    let now = chrono::Utc::now();
                                    let (y, m) = if now.month() == 12 {
                                        (now.year() + 1, 1)
                                    } else {
                                        (now.year(), now.month() + 1)
                                    };
                                    format!("{y}-{m:02}-01T00:00:00Z")
                                };
                                warn!(key_suffix = &key[key.len().saturating_sub(6)..], used = usage.conversion_count, limit, "Quota exceeded");
                                return (
                                    StatusCode::TOO_MANY_REQUESTS,
                                    Json(json!({
                                        "error": "quota_exceeded",
                                        "message": format!(
                                            "Monthly conversion limit reached ({}/{}). Upgrade your plan or wait until next month.",
                                            usage.conversion_count, limit
                                        ),
                                        "limit": limit,
                                        "used": usage.conversion_count,
                                        "resets_at": next_month,
                                        "status": 429
                                    })),
                                )
                                    .into_response();
                            }
                        }
                        Err(e) => {
                            // Log but don't block — fail open for quota checks
                            warn!(error = %e, "Failed to check monthly usage");
                        }
                    }
                }
            }

            let key_suffix = &key[key.len().saturating_sub(6)..];
            info!(key_suffix, tier = tier.name(), "Request authenticated");

            // Inject tier + raw key into request extensions for handler access
            request.extensions_mut().insert::<Tier>(tier.clone());
            request.extensions_mut().insert::<ApiKey>(ApiKey(key.clone()));
            next.run(request).await
        }
        None => {
            warn!(key_suffix = &key[key.len().saturating_sub(6)..], "Invalid API key");
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "invalid_api_key",
                    "message": "The provided API key is not valid.",
                    "status": 401
                })),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "engine": "sonic-converter",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// Readiness probe — includes database connectivity check.
#[cfg(feature = "server")]
async fn status_handler(State(state): State<AppState>) -> Response {
    let db_status = if let Some(ref db) = state.database {
        // Try a simple query to verify DB connectivity
        match db.get_monthly_usage("__health_check__").await {
            Ok(_) => "connected",
            Err(_) => "error",
        }
    } else {
        "not_configured"
    };

    let status_code = if db_status == "error" {
        StatusCode::SERVICE_UNAVAILABLE
    } else {
        StatusCode::OK
    };

    (
        status_code,
        Json(json!({
            "status": if status_code == StatusCode::OK { "ok" } else { "degraded" },
            "engine": "sonic-converter",
            "version": env!("CARGO_PKG_VERSION"),
            "database": db_status,
            "rate_limiting": "active",
        })),
    )
        .into_response()
}

/// Returns usage data for the authenticated API key.
#[cfg(feature = "server")]
async fn usage_handler(
    axum::Extension(tier): axum::Extension<Tier>,
    axum::Extension(api_key): axum::Extension<ApiKey>,
    State(state): State<AppState>,
) -> Response {
    let db = match &state.database {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "no_database",
                    "message": "Usage tracking is not configured on this server.",
                    "status": 503
                })),
            )
                .into_response();
        }
    };

    match db.get_monthly_usage(&api_key.0).await {
        Ok(usage) => {
            let month = chrono::Utc::now().format("%Y-%m").to_string();
            let limit = tier.monthly_limit();
            let now = chrono::Utc::now();
            let (y, m) = if now.month() == 12 {
                (now.year() + 1, 1)
            } else {
                (now.year(), now.month() + 1)
            };
            let resets_at = format!("{y}-{m:02}-01T00:00:00Z");

            Json(json!({
                "tier": tier.name().to_lowercase(),
                "month": month,
                "conversions": {
                    "used": usage.conversion_count,
                    "limit": limit
                },
                "info_requests": usage.info_count,
                "total_input_bytes": usage.total_bytes_in,
                "total_output_bytes": usage.total_bytes_out,
                "resets_at": resets_at
            }))
            .into_response()
        }
        Err(e) => {
            error!(error = %e, "Failed to fetch usage");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "internal_error", "message": "Failed to retrieve usage data.", "status": 500})),
            )
                .into_response()
        }
    }
}

/// Stream multipart upload to a temp file, then run bounded-memory conversion.
/// Enforces per-tier file size and bit depth limits.
#[cfg(feature = "server")]
async fn convert_handler(
    axum::Extension(tier): axum::Extension<Tier>,
    axum::Extension(api_key): axum::Extension<ApiKey>,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Response {
    let max_size = tier.max_file_size();

    let mut input_file: Option<tempfile::NamedTempFile> = None;
    let mut bit_depth: u8 = 16;
    let mut filename = String::from("output.wav");
    let mut input_size: u64 = 0;

    // --- Stream multipart chunks to a temp file ----------------------------
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                // Validate MIME type (accept audio/mpeg, audio/mp3, or .mp3 extension)
                let content_type = field.content_type().unwrap_or("").to_string();
                let raw_fname = field.file_name().unwrap_or("").to_string();
                let is_mp3 = content_type == "audio/mpeg"
                    || content_type == "audio/mp3"
                    || raw_fname.to_lowercase().ends_with(".mp3");

                if !is_mp3 {
                    return (
                        StatusCode::UNSUPPORTED_MEDIA_TYPE,
                        Json(json!({
                            "error": "unsupported_media_type",
                            "message": "Only MP3 files are accepted. Send a file with audio/mpeg content type or .mp3 extension.",
                            "status": 415
                        })),
                    )
                        .into_response();
                }

                // Sanitize filename: keep only safe characters
                let safe_name: String = raw_fname
                    .rsplit('/')
                    .next()
                    .unwrap_or(&raw_fname)
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == ' ')
                    .collect();
                if !safe_name.is_empty() {
                    filename = safe_name.replace(".mp3", ".wav").replace(".MP3", ".wav");
                }

                let tmp = match tempfile::NamedTempFile::new() {
                    Ok(t) => t,
                    Err(e) => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({"error": "internal_error", "message": format!("Temp file error: {e}"), "status": 500})),
                        )
                            .into_response();
                    }
                };

                let tmp_path = tmp.path().to_path_buf();
                let mut async_file = match tokio::fs::File::create(&tmp_path).await {
                    Ok(f) => f,
                    Err(e) => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({"error": "internal_error", "message": format!("Temp file create error: {e}"), "status": 500})),
                        )
                            .into_response();
                    }
                };

                // Stream chunks — only a small buffer is in RAM at a time
                // Enforce per-tier file size limit during streaming
                let mut stream = field;
                loop {
                    match stream.chunk().await {
                        Ok(Some(chunk)) => {
                            input_size += chunk.len() as u64;

                            // Reject early if file exceeds tier limit
                            if input_size > max_size {
                                return (
                                    StatusCode::PAYLOAD_TOO_LARGE,
                                    Json(json!({
                                        "error": "file_too_large",
                                        "message": format!(
                                            "File exceeds the {} limit for your {} plan.",
                                            tier.max_file_size_label(),
                                            tier.name()
                                        ),
                                        "max_bytes": max_size,
                                        "status": 413
                                    })),
                                )
                                    .into_response();
                            }

                            if let Err(e) = async_file.write_all(&chunk).await {
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(json!({"error": "internal_error", "message": format!("Write error: {e}"), "status": 500})),
                                )
                                    .into_response();
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({"error": "upload_error", "message": format!("Upload error: {e}"), "status": 400})),
                            )
                                .into_response();
                        }
                    }
                }

                if let Err(e) = async_file.flush().await {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": "internal_error", "message": format!("Flush error: {e}"), "status": 500})),
                    )
                        .into_response();
                }

                input_file = Some(tmp);
            }
            "bit_depth" => {
                if let Ok(text) = field.text().await {
                    bit_depth = text.parse().unwrap_or(16);
                }
            }
            _ => {}
        }
    }

    let input_tmp = match input_file {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing_file", "message": "No file provided. Send MP3 as multipart 'file' field.", "status": 400})),
            )
                .into_response();
        }
    };

    // Enforce per-tier bit depth restriction
    if !tier.allowed_bit_depths().contains(&bit_depth) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "bit_depth_not_allowed",
                "message": format!(
                    "{}-bit output is not available on your {} plan. Allowed: {:?}-bit.",
                    bit_depth,
                    tier.name(),
                    tier.allowed_bit_depths()
                ),
                "status": 403
            })),
        )
            .into_response();
    }

    let depth = match bit_depth {
        16 => sonic_converter::BitDepth::I16,
        24 => sonic_converter::BitDepth::I24,
        32 => sonic_converter::BitDepth::F32,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_bit_depth", "message": "Invalid bit_depth. Use 16, 24, or 32.", "status": 400})),
            )
                .into_response();
        }
    };

    // --- Bounded-memory conversion on a blocking thread --------------------
    let output_tmp = match tempfile::NamedTempFile::new() {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "internal_error", "message": format!("Temp file error: {e}"), "status": 500})),
            )
                .into_response();
        }
    };

    let input_path = input_tmp.path().to_path_buf();
    let output_path = output_tmp.path().to_path_buf();
    let start = Instant::now();

    let conversion = tokio::task::spawn_blocking(move || {
        let reader = std::fs::File::open(&input_path)?;
        let mut writer = std::fs::File::create(&output_path)?;

        sonic_converter::pipeline::stream::stream_convert(
            reader,
            &mut writer,
            depth,
            None::<fn(sonic_converter::Progress)>,
        )
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

        let output_size = writer.metadata()?.len();
        Ok::<u64, std::io::Error>(output_size)
    })
    .await;

    let output_size = match conversion {
        Ok(Ok(size)) => size,
        Ok(Err(e)) => {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({"error": "conversion_failed", "message": format!("Conversion failed: {e}"), "status": 422})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "internal_error", "message": format!("Task join error: {e}"), "status": 500})),
            )
                .into_response();
        }
    };

    let elapsed = start.elapsed().as_millis();

    // --- Stream the output file back (bounded memory) ----------------------
    let file = match tokio::fs::File::open(output_tmp.path()).await {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "internal_error", "message": format!("Read output error: {e}"), "status": 500})),
            )
                .into_response();
        }
    };

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let _input_guard = input_tmp;
    let _output_guard = output_tmp;

    // Log usage asynchronously (fire-and-forget)
    if let Some(ref db) = state.database {
        let db = db.clone();
        let key = api_key.0.clone();
        let bd = bit_depth;
        tokio::spawn(async move {
            db.log_usage(&key, "/v1/convert", 200, Some(input_size), Some(output_size), Some(elapsed as u64), Some(bd)).await;
        });
    }

    info!(elapsed_ms = elapsed, input_bytes = input_size, output_bytes = output_size, bit_depth, "Conversion complete");

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "audio/wav")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .header("X-Sonic-Elapsed-Ms", elapsed.to_string())
        .header("X-Sonic-Input-Size", input_size.to_string())
        .header("X-Sonic-Output-Size", output_size.to_string())
        .header("X-Sonic-Tier", tier.name())
        .header("X-Sonic-Max-File-Size", max_size.to_string())
        .body(body)
        .unwrap_or_else(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to build response",
            )
                .into_response()
        })
}

/// Info handler — streams upload to disk, decodes metadata only.
/// Also enforces per-tier file size limits.
/// Uses buffered file reading to avoid loading entire file into memory.
#[cfg(feature = "server")]
async fn info_handler(
    axum::Extension(tier): axum::Extension<Tier>,
    axum::Extension(api_key): axum::Extension<ApiKey>,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Response {
    let max_size = tier.max_file_size();
    let mut input_file: Option<tempfile::NamedTempFile> = None;
    let mut upload_size: u64 = 0;

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            let tmp = match tempfile::NamedTempFile::new() {
                Ok(t) => t,
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": "internal_error", "message": format!("Temp file error: {e}"), "status": 500})),
                    )
                        .into_response();
                }
            };

            let tmp_path = tmp.path().to_path_buf();
            let mut async_file = match tokio::fs::File::create(&tmp_path).await {
                Ok(f) => f,
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": "internal_error", "message": format!("Temp file create error: {e}"), "status": 500})),
                    )
                        .into_response();
                }
            };

            let mut stream = field;
            loop {
                match stream.chunk().await {
                    Ok(Some(chunk)) => {
                        upload_size += chunk.len() as u64;

                        if upload_size > max_size {
                            return (
                                StatusCode::PAYLOAD_TOO_LARGE,
                                Json(json!({
                                    "error": "file_too_large",
                                    "message": format!(
                                        "File exceeds the {} limit for your {} plan.",
                                        tier.max_file_size_label(),
                                        tier.name()
                                    ),
                                    "max_bytes": max_size,
                                    "status": 413
                                })),
                            )
                                .into_response();
                        }

                        if let Err(e) = async_file.write_all(&chunk).await {
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({"error": "internal_error", "message": format!("Write error: {e}"), "status": 500})),
                            )
                                .into_response();
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": "upload_error", "message": format!("Upload error: {e}"), "status": 400})),
                        )
                            .into_response();
                    }
                }
            }

            let _ = async_file.flush().await;
            input_file = Some(tmp);
        }
    }

    let input_tmp = match input_file {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "missing_file", "message": "No file provided.", "status": 400})),
            )
                .into_response();
        }
    };

    let input_path = input_tmp.path().to_path_buf();

    // Get input file size for bitrate calculation
    let input_file_size = tokio::fs::metadata(input_path.as_path())
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    // Use buffered file reader instead of loading entire file into memory
    let result = tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&input_path)?;
        let reader = std::io::BufReader::new(file);
        sonic_converter::decoder::decode_mp3_reader(reader)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    })
    .await;

    match result {
        Ok(Ok(decoded)) => {
            let total_samples = decoded.samples.len() / decoded.channels as usize;
            let estimated_wav_size_bytes = decoded.samples.len() * 2 + 44;
            let estimated_wav_size_mb = estimated_wav_size_bytes as f64 / 1_048_576.0;

            // Calculate MP3 bitrate from file size and duration
            let bit_rate_kbps = decoded.metadata.duration_secs.and_then(|dur| {
                if dur > 0.0 && input_file_size > 0 {
                    Some((input_file_size as f64 * 8.0 / dur / 1000.0).round() as u32)
                } else {
                    None
                }
            });

            // Log usage asynchronously
            if let Some(ref db) = state.database {
                let db = db.clone();
                let key = api_key.0.clone();
                let isz = input_file_size;
                tokio::spawn(async move {
                    db.log_usage(&key, "/v1/info", 200, Some(isz), None, None, None).await;
                });
            }

            Json(json!({
                "sample_rate": decoded.sample_rate,
                "channels": decoded.channels,
                "duration_secs": decoded.metadata.duration_secs,
                "bit_rate_kbps": bit_rate_kbps,
                "total_samples": total_samples,
                "estimated_wav_size_bytes": estimated_wav_size_bytes,
                "estimated_wav_size_mb": (estimated_wav_size_mb * 100.0).round() / 100.0,
            }))
            .into_response()
        },
        Ok(Err(e)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error": "decode_failed", "message": format!("Failed to read MP3: {e}"), "status": 422})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "internal_error", "message": format!("Task error: {e}"), "status": 500})),
        )
            .into_response(),
    }
}
