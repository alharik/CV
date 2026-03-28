#![allow(deprecated)] // symphonia-format-wav WavReader deprecated in favor of symphonia-format-riff (alpha)
/// Multi-format audio decoder using symphonia — handles MP3, WAV, FLAC, OGG, AAC.
use std::io::{Cursor, Read, Seek};

use symphonia_core::audio::{AudioBufferRef, Signal};
use symphonia_core::codecs::{CodecRegistry, DecoderOptions, CODEC_TYPE_NULL};
use symphonia_core::formats::FormatOptions;
use symphonia_core::io::{MediaSourceStream, ReadOnlySource};
use symphonia_core::meta::MetadataOptions;
use symphonia_core::probe::{Hint, Probe};

use crate::error::{Result, SonicError};
use crate::types::AudioMetadata;

/// Decoded PCM audio data.
pub struct DecodedAudio {
    /// Interleaved f32 samples.
    pub samples: Vec<f32>,
    /// Sample rate in Hz.
    pub sample_rate: u32,
    /// Number of channels.
    pub channels: u16,
    /// Source metadata.
    pub metadata: AudioMetadata,
}

/// Build a Probe with all supported format readers registered.
fn build_probe() -> Probe {
    let mut probe = Probe::default();
    probe.register_all::<symphonia_bundle_mp3::MpaReader>();
    probe.register_all::<symphonia_format_wav::WavReader>();
    probe.register_all::<symphonia_bundle_flac::FlacReader>();
    probe.register_all::<symphonia_format_ogg::OggReader>();
    probe.register_all::<symphonia_format_isomp4::IsoMp4Reader>();
    probe
}

/// Build a CodecRegistry with all supported codec decoders registered.
fn build_codec_registry() -> CodecRegistry {
    let mut registry = CodecRegistry::new();
    registry.register_all::<symphonia_bundle_mp3::MpaDecoder>();
    registry.register_all::<symphonia_codec_pcm::PcmDecoder>();
    registry.register_all::<symphonia_bundle_flac::FlacDecoder>();
    registry.register_all::<symphonia_codec_vorbis::VorbisDecoder>();
    registry.register_all::<symphonia_codec_aac::AacDecoder>();
    registry
}

/// Decode any supported audio format from bytes into raw PCM f32 samples.
///
/// Auto-detects format: MP3, WAV, FLAC, OGG Vorbis, AAC.
pub fn decode_audio(data: &[u8]) -> Result<DecodedAudio> {
    let cursor = Cursor::new(data.to_vec());
    decode_audio_reader(cursor, None)
}

/// Decode any supported audio format with an optional format hint.
pub fn decode_audio_with_hint(data: &[u8], extension: &str) -> Result<DecodedAudio> {
    let cursor = Cursor::new(data.to_vec());
    decode_audio_reader(cursor, Some(extension))
}

/// Decode MP3 bytes into raw PCM f32 samples (backwards compatibility).
pub fn decode_mp3(data: &[u8]) -> Result<DecodedAudio> {
    decode_audio_with_hint(data, "mp3")
}

/// Decode audio from any reader into raw PCM f32 samples.
fn decode_audio_reader<R: Read + Seek + Send + Sync + 'static>(
    reader: R,
    extension_hint: Option<&str>,
) -> Result<DecodedAudio> {
    let source = ReadOnlySource::new(reader);
    let mss = MediaSourceStream::new(Box::new(source), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = extension_hint {
        hint.with_extension(ext);
    }

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let metadata_opts = MetadataOptions::default();

    // Probe to auto-detect the format
    let probe = build_probe();
    let probed = probe
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|e| {
            SonicError::UnsupportedFormat(format!("Could not detect audio format: {}", e))
        })?;

    let mut format = probed.format;

    // Find the first audio track
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or(SonicError::NoAudioTrack)?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let sample_rate = codec_params
        .sample_rate
        .ok_or_else(|| SonicError::Decode("Unknown sample rate".into()))?;

    let channels = codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);

    let duration_secs = codec_params
        .n_frames
        .map(|n| n as f64 / sample_rate as f64);

    // Create decoder from the codec registry
    let registry = build_codec_registry();
    let decoder_opts = DecoderOptions::default();
    let mut decoder = registry
        .make(&codec_params, &decoder_opts)
        .map_err(|e| SonicError::UnsupportedFormat(format!("No decoder for codec: {}", e)))?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(symphonia_core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(symphonia_core::errors::Error::ResetRequired) => {
                continue;
            }
            Err(e) => {
                return Err(SonicError::Decode(format!("Error reading packet: {}", e)));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia_core::errors::Error::DecodeError(_)) => {
                // Skip corrupted frames gracefully
                continue;
            }
            Err(e) => {
                return Err(SonicError::Decode(format!("Decode error: {}", e)));
            }
        };

        copy_samples_to_vec(&decoded, &mut all_samples, channels);
    }

    let format_name = detect_format_name(&codec_params);

    let metadata = AudioMetadata {
        sample_rate,
        channels,
        duration_secs,
        bitrate_kbps: None,
        is_vbr: None,
        format: Some(format_name),
    };

    Ok(DecodedAudio {
        samples: all_samples,
        sample_rate,
        channels,
        metadata,
    })
}

/// Detect a human-readable format name from codec parameters.
fn detect_format_name(codec_params: &symphonia_core::codecs::CodecParameters) -> String {
    use symphonia_core::codecs::*;

    let codec = codec_params.codec;
    if codec == CODEC_TYPE_MP3 {
        "mp3".to_string()
    } else if codec == CODEC_TYPE_FLAC {
        "flac".to_string()
    } else if codec == CODEC_TYPE_VORBIS {
        "ogg".to_string()
    } else if codec == CODEC_TYPE_AAC {
        "aac".to_string()
    } else if codec == CODEC_TYPE_PCM_S16LE
        || codec == CODEC_TYPE_PCM_S24LE
        || codec == CODEC_TYPE_PCM_S32LE
        || codec == CODEC_TYPE_PCM_F32LE
        || codec == CODEC_TYPE_PCM_F64LE
        || codec == CODEC_TYPE_PCM_U8
    {
        "wav".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Copy decoded audio buffer samples into an interleaved f32 vec.
fn copy_samples_to_vec(buf: &AudioBufferRef, output: &mut Vec<f32>, channels: u16) {
    match buf {
        AudioBufferRef::F32(b) => {
            copy_typed_buffer(b, output, channels);
        }
        AudioBufferRef::F64(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            for frame in 0..frames {
                for c in 0..ch {
                    let src_ch = c.min(b.spec().channels.count() - 1);
                    output.push(b.chan(src_ch)[frame] as f32);
                }
            }
        }
        AudioBufferRef::S32(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            let scale = 1.0 / i32::MAX as f32;
            for frame in 0..frames {
                for c in 0..ch {
                    let src_ch = c.min(b.spec().channels.count() - 1);
                    output.push(b.chan(src_ch)[frame] as f32 * scale);
                }
            }
        }
        AudioBufferRef::S16(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            let scale = 1.0 / i16::MAX as f32;
            for frame in 0..frames {
                for c in 0..ch {
                    let src_ch = c.min(b.spec().channels.count() - 1);
                    output.push(b.chan(src_ch)[frame] as f32 * scale);
                }
            }
        }
        AudioBufferRef::U8(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            for frame in 0..frames {
                for c in 0..ch {
                    let src_ch = c.min(b.spec().channels.count() - 1);
                    output.push((b.chan(src_ch)[frame] as f32 - 128.0) / 128.0);
                }
            }
        }
        _ => {}
    }
}

/// Optimized copy for f32 buffers (most common path).
fn copy_typed_buffer(
    b: &symphonia_core::audio::AudioBuffer<f32>,
    output: &mut Vec<f32>,
    channels: u16,
) {
    let frames = b.frames();
    let ch = channels as usize;
    output.reserve(frames * ch);
    for frame in 0..frames {
        for c in 0..ch {
            let src_ch = c.min(b.spec().channels.count() - 1);
            output.push(b.chan(src_ch)[frame]);
        }
    }
}
