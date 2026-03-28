/// WASM bindings for browser-based audio conversion.
///
/// Supports: MP3, WAV, FLAC, OGG Vorbis, AAC → WAV output.
use wasm_bindgen::prelude::*;

use crate::decoder;
use crate::encoder;
use crate::processor;
use crate::types::BitDepth;

/// Initialize panic hook for better error messages in browser console.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// ─── Legacy API (backwards compatible) ───────────────────────────

/// Convert MP3 bytes to WAV bytes (16-bit PCM).
#[wasm_bindgen(js_name = "convertMp3ToWav")]
pub fn convert_mp3_to_wav(mp3_data: &[u8]) -> std::result::Result<Vec<u8>, JsValue> {
    convert_mp3_to_wav_with_depth(mp3_data, 16)
}

/// Convert MP3 bytes to WAV bytes with configurable bit depth.
#[wasm_bindgen(js_name = "convertMp3ToWavWithDepth")]
pub fn convert_mp3_to_wav_with_depth(
    mp3_data: &[u8],
    bit_depth: u8,
) -> std::result::Result<Vec<u8>, JsValue> {
    convert_audio_to_wav(mp3_data, bit_depth, 0)
}

// ─── New v1.1 API ────────────────────────────────────────────────

/// Convert any supported audio format to WAV.
///
/// Auto-detects input format (MP3, WAV, FLAC, OGG, AAC).
/// `bit_depth`: 16, 24, or 32.
/// `target_sample_rate`: desired output rate in Hz, or 0 to keep original.
#[wasm_bindgen(js_name = "convertAudioToWav")]
pub fn convert_audio_to_wav(
    audio_data: &[u8],
    bit_depth: u8,
    target_sample_rate: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    let depth = match bit_depth {
        16 => BitDepth::I16,
        24 => BitDepth::I24,
        32 => BitDepth::F32,
        _ => return Err(JsValue::from_str("Invalid bit depth: use 16, 24, or 32")),
    };

    // Decode any supported format
    let decoded = decoder::decode_audio(audio_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    // Resample if requested
    let (samples, sample_rate) =
        if target_sample_rate > 0 && target_sample_rate != decoded.sample_rate {
            let resampled = processor::resample_audio(
                &decoded.samples,
                decoded.channels,
                decoded.sample_rate,
                target_sample_rate,
            )
            .map_err(|e| JsValue::from_str(&format!("Resample error: {}", e)))?;

            match resampled {
                Some(data) => (data, target_sample_rate),
                None => (decoded.samples, decoded.sample_rate),
            }
        } else {
            (decoded.samples, decoded.sample_rate)
        };

    // Encode to WAV
    let wav_data = encoder::wav::encode_wav(&samples, sample_rate, decoded.channels, depth)
        .map_err(|e| JsValue::from_str(&format!("Encode error: {}", e)))?;

    Ok(wav_data)
}

/// Get audio metadata from any supported format without full conversion.
///
/// Returns a JSON string with sampleRate, channels, durationSecs, totalSamples, format.
#[wasm_bindgen(js_name = "getAudioInfo")]
pub fn get_audio_info(audio_data: &[u8]) -> std::result::Result<String, JsValue> {
    let decoded = decoder::decode_audio(audio_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    let format = decoded
        .metadata
        .format
        .as_deref()
        .unwrap_or("unknown");

    let info = format!(
        r#"{{"sampleRate":{},"channels":{},"durationSecs":{},"totalSamples":{},"format":"{}"}}"#,
        decoded.sample_rate,
        decoded.channels,
        decoded.metadata.duration_secs.unwrap_or(0.0),
        decoded.samples.len() / decoded.channels as usize,
        format,
    );

    Ok(info)
}

/// Get audio metadata from MP3 bytes (backwards compatible).
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

// ─── v1.2 API: Reverse conversion (WAV → other formats) ─────

/// Convert WAV (or any supported input) to FLAC.
///
/// `bit_depth`: 16, 24, or 32.
/// `target_sample_rate`: desired output rate in Hz, or 0 to keep original.
#[wasm_bindgen(js_name = "convertWavToFlac")]
pub fn convert_wav_to_flac(
    audio_data: &[u8],
    bit_depth: u8,
    target_sample_rate: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    let depth = match bit_depth {
        16 => BitDepth::I16,
        24 => BitDepth::I24,
        32 => BitDepth::F32,
        _ => return Err(JsValue::from_str("Invalid bit depth: use 16, 24, or 32")),
    };

    // Decode input (WAV or any supported format)
    let decoded = decoder::decode_audio(audio_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    // Resample if requested
    let (samples, sample_rate) =
        if target_sample_rate > 0 && target_sample_rate != decoded.sample_rate {
            let resampled = processor::resample_audio(
                &decoded.samples,
                decoded.channels,
                decoded.sample_rate,
                target_sample_rate,
            )
            .map_err(|e| JsValue::from_str(&format!("Resample error: {}", e)))?;

            match resampled {
                Some(data) => (data, target_sample_rate),
                None => (decoded.samples, decoded.sample_rate),
            }
        } else {
            (decoded.samples, decoded.sample_rate)
        };

    // Encode to FLAC
    let flac_data =
        crate::encoder::flac::encode_flac(&samples, sample_rate, decoded.channels, depth)
            .map_err(|e| JsValue::from_str(&format!("FLAC encode error: {}", e)))?;

    Ok(flac_data)
}

/// Convert WAV (or any supported input) to OGG (Ogg FLAC container).
///
/// Produces Ogg FLAC files — lossless audio in the OGG container.
/// Supported by VLC, ffmpeg, Audacity, and most audio software.
#[wasm_bindgen(js_name = "convertWavToOgg")]
pub fn convert_wav_to_ogg(
    audio_data: &[u8],
    bit_depth: u8,
    target_sample_rate: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    let depth = match bit_depth {
        16 => BitDepth::I16,
        24 => BitDepth::I24,
        32 => BitDepth::F32,
        _ => return Err(JsValue::from_str("Invalid bit depth: use 16, 24, or 32")),
    };

    let decoded = decoder::decode_audio(audio_data)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    let (samples, sample_rate) =
        if target_sample_rate > 0 && target_sample_rate != decoded.sample_rate {
            let resampled = processor::resample_audio(
                &decoded.samples,
                decoded.channels,
                decoded.sample_rate,
                target_sample_rate,
            )
            .map_err(|e| JsValue::from_str(&format!("Resample error: {}", e)))?;

            match resampled {
                Some(data) => (data, target_sample_rate),
                None => (decoded.samples, decoded.sample_rate),
            }
        } else {
            (decoded.samples, decoded.sample_rate)
        };

    let ogg_data =
        crate::encoder::ogg::encode_ogg(&samples, sample_rate, decoded.channels, depth)
            .map_err(|e| JsValue::from_str(&format!("OGG encode error: {}", e)))?;

    Ok(ogg_data)
}

/// Get list of supported input formats.
#[wasm_bindgen(js_name = "getSupportedFormats")]
pub fn get_supported_formats() -> String {
    r#"["mp3","wav","flac","ogg","aac"]"#.to_string()
}

/// Get list of supported output formats.
#[wasm_bindgen(js_name = "getSupportedOutputFormats")]
pub fn get_supported_output_formats() -> String {
    r#"["wav","flac","ogg"]"#.to_string()
}

/// Get the version of sonic-converter.
#[wasm_bindgen(js_name = "getVersion")]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
