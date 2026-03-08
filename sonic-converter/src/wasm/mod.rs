/// WASM bindings for browser-based MP3 → WAV conversion.
use wasm_bindgen::prelude::*;

use crate::decoder;
use crate::encoder;
use crate::types::BitDepth;

/// Initialize panic hook for better error messages in browser console.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Convert MP3 bytes to WAV bytes (16-bit PCM).
///
/// This is the main entry point for browser-based conversion.
/// Takes a Uint8Array of MP3 data and returns a Uint8Array of WAV data.
#[wasm_bindgen(js_name = "convertMp3ToWav")]
pub fn convert_mp3_to_wav(mp3_data: &[u8]) -> std::result::Result<Vec<u8>, JsValue> {
    convert_mp3_to_wav_with_depth(mp3_data, 16)
}

/// Convert MP3 bytes to WAV bytes with configurable bit depth.
///
/// `bit_depth`: 16 (default), 24, or 32 (float).
#[wasm_bindgen(js_name = "convertMp3ToWavWithDepth")]
pub fn convert_mp3_to_wav_with_depth(
    mp3_data: &[u8],
    bit_depth: u8,
) -> std::result::Result<Vec<u8>, JsValue> {
    let depth = match bit_depth {
        16 => BitDepth::I16,
        24 => BitDepth::I24,
        32 => BitDepth::F32,
        _ => return Err(JsValue::from_str("Invalid bit depth: use 16, 24, or 32")),
    };

    let decoded = decoder::decode_mp3(mp3_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    let wav_data = encoder::wav::encode_wav(
        &decoded.samples,
        decoded.sample_rate,
        decoded.channels,
        depth,
    )
    .map_err(|e| JsValue::from_str(&format!("Encode error: {}", e)))?;

    Ok(wav_data)
}

/// Get audio metadata from MP3 bytes without full conversion.
///
/// Returns a JSON string with sample_rate, channels, duration_secs.
#[wasm_bindgen(js_name = "getMp3Info")]
pub fn get_mp3_info(mp3_data: &[u8]) -> std::result::Result<String, JsValue> {
    let decoded = decoder::decode_mp3(mp3_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    let info = format!(
        r#"{{"sampleRate":{},"channels":{},"durationSecs":{},"totalSamples":{}}}"#,
        decoded.sample_rate,
        decoded.channels,
        decoded.metadata.duration_secs.unwrap_or(0.0),
        decoded.samples.len() / decoded.channels as usize,
    );

    Ok(info)
}

/// Get the version of sonic-converter.
#[wasm_bindgen(js_name = "getVersion")]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
