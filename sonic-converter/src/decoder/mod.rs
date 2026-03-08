/// MP3 decoder using symphonia — handles all MP3 variants.
use std::io::{Cursor, Read, Seek};

use symphonia_bundle_mp3::MpaReader;
use symphonia_core::audio::{AudioBufferRef, Signal};
use symphonia_core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_MP3};
use symphonia_core::formats::{FormatOptions, FormatReader};
use symphonia_core::io::{MediaSourceStream, ReadOnlySource};
use symphonia_core::meta::MetadataOptions;
use symphonia_core::probe::Hint;

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

/// Decode MP3 bytes into raw PCM f32 samples.
pub fn decode_mp3(data: &[u8]) -> Result<DecodedAudio> {
    let cursor = Cursor::new(data.to_vec());
    decode_mp3_reader(cursor)
}

/// Decode MP3 from any reader into raw PCM f32 samples.
pub fn decode_mp3_reader<R: Read + Seek + Send + Sync + 'static>(reader: R) -> Result<DecodedAudio> {
    let source = ReadOnlySource::new(reader);
    let mss = MediaSourceStream::new(Box::new(source), Default::default());

    let mut hint = Hint::new();
    hint.with_extension("mp3");

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let metadata_opts = MetadataOptions::default();

    let mut format = MpaReader::try_new(mss, &format_opts)
        .map_err(|e| SonicError::Decode(format!("Failed to read MP3: {}", e)))?;

    // Find the MP3 audio track
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec == CODEC_TYPE_MP3)
        .ok_or(SonicError::NoAudioTrack)?;

    let track_id = track.id;

    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| SonicError::Decode("Unknown sample rate".into()))?;

    let channels = track
        .codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);

    let duration_secs = track
        .codec_params
        .n_frames
        .map(|n| n as f64 / sample_rate as f64);

    let decoder_opts = DecoderOptions::default();
    let mut decoder = symphonia_bundle_mp3::MpaDecoder::try_new(&track.codec_params, &decoder_opts)
        .map_err(|e| SonicError::Decode(format!("Failed to create decoder: {}", e)))?;

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
                // Some streams require a reset mid-stream
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

    let metadata = AudioMetadata {
        sample_rate,
        channels,
        duration_secs,
        bitrate_kbps: None,
        is_vbr: None,
    };

    Ok(DecodedAudio {
        samples: all_samples,
        sample_rate,
        channels,
        metadata,
    })
}

/// Copy decoded audio buffer samples into an interleaved f32 vec.
fn copy_samples_to_vec(buf: &AudioBufferRef, output: &mut Vec<f32>, channels: u16) {
    match buf {
        AudioBufferRef::F32(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            for frame in 0..frames {
                for c in 0..ch {
                    if c < b.spec().channels.count() {
                        output.push(b.chan(c)[frame]);
                    } else {
                        // Duplicate last channel if needed
                        output.push(b.chan(b.spec().channels.count() - 1)[frame]);
                    }
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
                    if c < b.spec().channels.count() {
                        output.push(b.chan(c)[frame] as f32 * scale);
                    } else {
                        output.push(b.chan(b.spec().channels.count() - 1)[frame] as f32 * scale);
                    }
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
                    if c < b.spec().channels.count() {
                        output.push(b.chan(c)[frame] as f32 * scale);
                    } else {
                        output.push(b.chan(b.spec().channels.count() - 1)[frame] as f32 * scale);
                    }
                }
            }
        }
        AudioBufferRef::U8(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            output.reserve(frames * ch);
            for frame in 0..frames {
                for c in 0..ch {
                    if c < b.spec().channels.count() {
                        output.push((b.chan(c)[frame] as f32 - 128.0) / 128.0);
                    } else {
                        output.push((b.chan(b.spec().channels.count() - 1)[frame] as f32 - 128.0) / 128.0);
                    }
                }
            }
        }
        _ => {
            // Fallback: try to get frames from the spec
        }
    }
}
