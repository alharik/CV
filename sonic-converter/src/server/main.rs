/// Sonic Converter API Server — sellable REST API for MP3 → WAV conversion.
#[cfg(feature = "server")]
use axum::{
    extract::Multipart,
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
#[cfg(feature = "server")]
use serde_json::json;
#[cfg(feature = "server")]
use std::time::Instant;
#[cfg(feature = "server")]
use tower_http::cors::{Any, CorsLayer};
#[cfg(feature = "server")]
use tower_http::limit::RequestBodyLimitLayer;

#[cfg(feature = "server")]
#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health))
        .route("/health", get(health))
        .route("/convert", post(convert_handler))
        .route("/info", post(info_handler))
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(100 * 1024 * 1024)); // 100MB limit

    let addr = std::env::var("SONIC_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    println!("Sonic Converter API running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(not(feature = "server"))]
fn main() {
    eprintln!("Server feature not enabled. Build with: cargo run --features server");
    std::process::exit(1);
}

#[cfg(feature = "server")]
async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "engine": "sonic-converter",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[cfg(feature = "server")]
async fn convert_handler(mut multipart: Multipart) -> Response {
    let mut mp3_data: Option<Vec<u8>> = None;
    let mut bit_depth: u8 = 16;
    let mut filename = String::from("output.wav");

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                if let Some(fname) = field.file_name() {
                    filename = fname
                        .rsplit('/')
                        .next()
                        .unwrap_or(fname)
                        .replace(".mp3", ".wav");
                }
                match field.bytes().await {
                    Ok(bytes) => mp3_data = Some(bytes.to_vec()),
                    Err(e) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": format!("Failed to read file: {}", e)})),
                        )
                            .into_response();
                    }
                }
            }
            "bit_depth" => {
                if let Ok(text) = field.text().await {
                    bit_depth = text.parse().unwrap_or(16);
                }
            }
            _ => {}
        }
    }

    let mp3_data = match mp3_data {
        Some(d) => d,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "No file provided. Send MP3 as multipart 'file' field."})),
            )
                .into_response();
        }
    };

    let depth = match bit_depth {
        16 => sonic_converter::BitDepth::I16,
        24 => sonic_converter::BitDepth::I24,
        32 => sonic_converter::BitDepth::F32,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid bit_depth. Use 16, 24, or 32."})),
            )
                .into_response();
        }
    };

    let start = Instant::now();

    match sonic_converter::Converter::new()
        .bit_depth(depth)
        .convert_bytes(&mp3_data)
    {
        Ok(wav_data) => {
            let elapsed = start.elapsed().as_millis();

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "audio/wav")
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}\"", filename),
                )
                .header("X-Sonic-Elapsed-Ms", elapsed.to_string())
                .header("X-Sonic-Input-Size", mp3_data.len().to_string())
                .header("X-Sonic-Output-Size", wav_data.len().to_string())
                .body(axum::body::Body::from(wav_data))
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build response",
                    )
                        .into_response()
                })
        }
        Err(e) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error": format!("Conversion failed: {}", e)})),
        )
            .into_response(),
    }
}

#[cfg(feature = "server")]
async fn info_handler(mut multipart: Multipart) -> Response {
    let mut mp3_data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                mp3_data = Some(bytes.to_vec());
            }
        }
    }

    let mp3_data = match mp3_data {
        Some(d) => d,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "No file provided."})),
            )
                .into_response();
        }
    };

    match sonic_converter::decoder::decode_mp3(&mp3_data) {
        Ok(decoded) => Json(json!({
            "sample_rate": decoded.sample_rate,
            "channels": decoded.channels,
            "duration_secs": decoded.metadata.duration_secs,
            "total_samples": decoded.samples.len() / decoded.channels as usize,
            "estimated_wav_size_bytes": decoded.samples.len() * 2 + 44,
        }))
        .into_response(),
        Err(e) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error": format!("Failed to read MP3: {}", e)})),
        )
            .into_response(),
    }
}
