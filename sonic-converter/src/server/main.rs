/// Sonic Converter API Server — hardened REST API for MP3 → WAV conversion.
///
/// Security layers (Vercel-optimized):
///   1. Strict CORS (allowlisted origins only)
///   2. API key authentication (x-api-key or Authorization: Bearer header)
///   3. Per-tier file size + bit depth enforcement
///   4. Streaming multipart → temp file (bounded memory)
///
/// Rate limiting is delegated to Vercel/Cloudflare at the edge.

#[cfg(feature = "server")]
use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
#[cfg(feature = "server")]
use serde_json::json;
#[cfg(feature = "server")]
use std::collections::HashMap;
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
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
#[cfg(feature = "server")]
#[tokio::main]
async fn main() {
    // --- API keys (tier-based) ---------------------------------------------
    // Option A: JSON object mapping keys to tiers (preferred for production)
    //   SONIC_API_KEYS='{"sk_abc123":"free","sk_pro456":"pro","sk_biz789":"business","sk_unl000":"unlimited"}'
    //
    // Option B: Single key (backwards-compatible, defaults to Free tier)
    //   SONIC_API_KEY=sonic-dev-key-change-me
    let api_keys: HashMap<String, Tier> = if let Ok(json_str) = std::env::var("SONIC_API_KEYS") {
        let raw: HashMap<String, String> = serde_json::from_str(&json_str).unwrap_or_else(|e| {
            eprintln!("ERROR: Failed to parse SONIC_API_KEYS JSON: {e}");
            eprintln!("Expected format: {{\"key1\":\"free\",\"key2\":\"pro\",...}}");
            std::process::exit(1);
        });
        raw.into_iter()
            .filter_map(|(key, tier_str)| {
                Tier::from_str(&tier_str).map(|tier| {
                    println!("  Loaded API key ...{} → {} tier", &key[key.len().saturating_sub(6)..], tier.name());
                    (key, tier)
                })
            })
            .collect()
    } else {
        let key = std::env::var("SONIC_API_KEY").unwrap_or_else(|_| {
            eprintln!("╔══════════════════════════════════════════════════════════════╗");
            eprintln!("║  WARNING: SONIC_API_KEY not set — using default dev key!    ║");
            eprintln!("║  This key is PUBLIC and must NOT be used in production.     ║");
            eprintln!("║                                                            ║");
            eprintln!("║  Set one of these env vars before deploying:                ║");
            eprintln!("║    SONIC_API_KEY=your-secret-key                            ║");
            eprintln!("║    SONIC_API_KEYS='{{\"key1\":\"free\",\"key2\":\"pro\"}}'          ║");
            eprintln!("╚══════════════════════════════════════════════════════════════╝");
            "sonic-dev-key-DO-NOT-USE-IN-PRODUCTION".to_string()
        });
        let mut map = HashMap::new();
        map.insert(key, Tier::Free);
        map
    };

    println!("Loaded {} API key(s)", api_keys.len());

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

    let state = AppState { api_keys };

    // --- Router ------------------------------------------------------------
    let protected = Router::new()
        .route("/convert", post(convert_handler))
        .route("/info", post(info_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    let app = Router::new()
        .route("/", get(health))
        .route("/health", get(health))
        .nest("/v1", protected)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(5 * 1024 * 1024 * 1024)) // 5 GB (max tier)
        .with_state(state);

    let addr = std::env::var("SONIC_ADDR").or_else(|_| {
        std::env::var("PORT").map(|p| format!("0.0.0.0:{p}"))
    }).unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    println!("Sonic Converter API running on http://{addr}");
    println!("  CORS origins: {allowed_origins_raw}");

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
// Middleware: API key authentication
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
            // Inject tier into request extensions for handler access
            request.extensions_mut().insert::<Tier>(tier.clone());
            next.run(request).await
        }
        None => (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "invalid_api_key",
                "message": "The provided API key is not valid.",
                "status": 401
            })),
        )
            .into_response(),
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

/// Stream multipart upload to a temp file, then run bounded-memory conversion.
/// Enforces per-tier file size and bit depth limits.
#[cfg(feature = "server")]
async fn convert_handler(
    axum::Extension(tier): axum::Extension<Tier>,
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

    // Use buffered file reader instead of loading entire file into memory
    let result = tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&input_path)?;
        let reader = std::io::BufReader::new(file);
        sonic_converter::decoder::decode_mp3_reader(reader)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    })
    .await;

    match result {
        Ok(Ok(decoded)) => Json(json!({
            "sample_rate": decoded.sample_rate,
            "channels": decoded.channels,
            "duration_secs": decoded.metadata.duration_secs,
            "total_samples": decoded.samples.len() / decoded.channels as usize,
            "estimated_wav_size_bytes": decoded.samples.len() * 2 + 44,
        }))
        .into_response(),
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
