/// Streaming conversion — bounded memory for large files.
use std::io::{Read, Seek, Write};

use symphonia_bundle_mp3::MpaReader;
use symphonia_core::audio::{AudioBufferRef, Signal};
use symphonia_core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_MP3};
use symphonia_core::formats::{FormatOptions, FormatReader};
use symphonia_core::io::{MediaSourceStream, ReadOnlySource};
use symphonia_core::probe::Hint;

use crate::encoder::wav::{write_wav_header, write_samples_to_writer};
use crate::error::{Result, SonicError};
use crate::types::{BitDepth, Progress};

/// Stream-convert MP3 to WAV with bounded memory usage.
/// Calls `on_progress` with updates during conversion.
pub fn stream_convert<R, W, F>(
    reader: R,
    writer: &mut W,
    bit_depth: BitDepth,
    on_progress: Option<F>,
) -> Result<()>
where
    R: Read + Seek + Send + Sync + 'static,
    W: Write + Seek,
    F: FnMut(Progress),
{
    let source = ReadOnlySource::new(reader);
    let mss = MediaSourceStream::new(Box::new(source), Default::default());

    let mut hint = Hint::new();
    hint.with_extension("mp3");

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };

    let mut format = MpaReader::try_new(mss, &format_opts)
        .map_err(|e| SonicError::Decode(format!("Failed to read MP3: {}", e)))?;

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

    let decoder_opts = DecoderOptions::default();
    let mut decoder = symphonia_bundle_mp3::MpaDecoder::try_new(&track.codec_params, &decoder_opts)
        .map_err(|e| SonicError::Decode(format!("Failed to create decoder: {}", e)))?;

    // Write placeholder header (will update later)
    write_wav_header(writer, sample_rate, channels, bit_depth, 0)?;

    let mut total_samples: u32 = 0;
    let mut packet_count: u64 = 0;
    let mut progress_fn = on_progress;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia_core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(symphonia_core::errors::Error::ResetRequired) => continue,
            Err(e) => return Err(SonicError::Decode(format!("Packet error: {}", e))),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia_core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(SonicError::Decode(format!("Decode error: {}", e))),
        };

        let chunk = extract_samples(&decoded, channels);
        total_samples += chunk.len() as u32;
        write_samples_to_writer(writer, &chunk, bit_depth)?;

        packet_count += 1;
        if let Some(ref mut cb) = progress_fn {
            if packet_count % 50 == 0 {
                cb(Progress {
                    percent: 0, // Can't know total in streaming mode
                    bytes_decoded: packet_count * 1152, // Approximate
                    total_bytes: None,
                    phase: "Converting",
                });
            }
        }
    }

    // Seek back and update WAV header with actual size
    writer
        .seek(std::io::SeekFrom::Start(0))
        .map_err(|e| SonicError::Encode(format!("Seek error: {}", e)))?;
    write_wav_header(writer, sample_rate, channels, bit_depth, total_samples)?;

    Ok(())
}

/// Extract interleaved f32 samples from a decoded audio buffer.
fn extract_samples(buf: &AudioBufferRef, channels: u16) -> Vec<f32> {
    let mut out = Vec::new();
    match buf {
        AudioBufferRef::F32(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            out.reserve(frames * ch);
            for frame in 0..frames {
                for c in 0..ch {
                    if c < b.spec().channels.count() {
                        out.push(b.chan(c)[frame]);
                    } else {
                        out.push(b.chan(b.spec().channels.count() - 1)[frame]);
                    }
                }
            }
        }
        AudioBufferRef::S32(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            out.reserve(frames * ch);
            let scale = 1.0 / i32::MAX as f32;
            for frame in 0..frames {
                for c in 0..ch {
                    if c < b.spec().channels.count() {
                        out.push(b.chan(c)[frame] as f32 * scale);
                    } else {
                        out.push(b.chan(b.spec().channels.count() - 1)[frame] as f32 * scale);
                    }
                }
            }
        }
        AudioBufferRef::S16(b) => {
            let frames = b.frames();
            let ch = channels as usize;
            out.reserve(frames * ch);
            let scale = 1.0 / i16::MAX as f32;
            for frame in 0..frames {
                for c in 0..ch {
                    if c < b.spec().channels.count() {
                        out.push(b.chan(c)[frame] as f32 * scale);
                    } else {
                        out.push(b.chan(b.spec().channels.count() - 1)[frame] as f32 * scale);
                    }
                }
            }
        }
        _ => {}
    }
    out
}
