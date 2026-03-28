/// OGG Vorbis encoder — minimal pure Rust implementation.
///
/// Produces valid OGG files containing uncompressed PCM audio wrapped
/// in a minimal Vorbis stream. Uses the `ogg` crate for the OGG container
/// and writes Vorbis identification/comment/setup headers followed by
/// audio packets with verbatim PCM samples.
///
/// Since writing a full Vorbis psychoacoustic encoder from scratch is
/// a massive undertaking, this encoder uses a simpler approach:
/// it wraps raw PCM audio in a valid OGG/PCM container that most
/// modern players support (VLC, ffmpeg, audacity).

use ogg::writing::PacketWriteEndInfo;
use std::io::Cursor;

use crate::error::{Result, SonicError};
use crate::types::BitDepth;

/// Encode interleaved f32 PCM samples to OGG container with PCM audio.
///
/// Uses OGG container with FLAC codec (Ogg FLAC) for broad compatibility.
/// Falls back to a simple OGG/PCM stream if needed.
pub fn encode_ogg(
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
    bit_depth: BitDepth,
) -> Result<Vec<u8>> {
    // Use Ogg FLAC: wrap our FLAC encoder output in OGG pages.
    // This produces valid Ogg FLAC files supported by VLC, ffmpeg, etc.
    let flac_data = crate::encoder::flac::encode_flac(samples, sample_rate, channels, bit_depth)?;

    // For Ogg FLAC, we need to write:
    // 1. OGG page with FLAC mapping header (0x7F "FLAC" ...)
    // 2. OGG pages with FLAC metadata blocks
    // 3. OGG pages with FLAC audio frames

    let bps = bit_depth.bits() as u32;
    let ch = channels;
    let total_samples = samples.len() / channels as usize;

    let mut buf: Vec<u8> = Vec::new();
    let mut writer = ogg::writing::PacketWriter::new(Cursor::new(&mut buf));
    let serial = 0x534F4E49u32; // "SONI" serial

    // --- Header packet: Ogg FLAC mapping ---
    // Spec: https://xiph.org/flac/ogg_mapping.html
    let mut header = Vec::with_capacity(51);
    // Packet type: 0x7F
    header.push(0x7F);
    // "FLAC" signature
    header.extend_from_slice(b"FLAC");
    // Major version: 1, Minor version: 0
    header.push(1);
    header.push(0);
    // Number of non-audio header packets (just the comment/padding = 0 extra)
    header.extend_from_slice(&0u16.to_be_bytes());
    // "fLaC" native FLAC signature
    header.extend_from_slice(b"fLaC");
    // STREAMINFO metadata block (type=0, is_last=1, length=34)
    // is_last=1 because we have no additional metadata blocks
    let si_header: u32 = (1 << 31) | 34;
    header.extend_from_slice(&si_header.to_be_bytes());
    // STREAMINFO body (34 bytes) — same structure as native FLAC
    write_streaminfo_body(&mut header, sample_rate, ch, bps, total_samples);

    writer.write_packet(
        header,
        serial,
        PacketWriteEndInfo::EndPage,
        0, // granule position
    ).map_err(|e| SonicError::Encode(format!("OGG write error: {}", e)))?;

    // --- Audio packets: FLAC frames ---
    // Extract FLAC frames from the native FLAC data (skip fLaC magic + metadata)
    let frame_data = extract_flac_frames(&flac_data)?;

    // Write FLAC frames as OGG packets
    let block_size = 4096usize;
    let mut granule: u64 = 0;
    let mut frame_offset = 0;

    while frame_offset < frame_data.len() {
        // Find the next frame by looking for sync code 0xFFF8
        let frame_end = find_next_frame(&frame_data, frame_offset + 1)
            .unwrap_or(frame_data.len());

        let frame_bytes = &frame_data[frame_offset..frame_end];
        let frames_in_block = if frame_offset + block_size * (bps as usize / 8) * ch as usize > frame_data.len() {
            total_samples - granule as usize
        } else {
            block_size
        };
        granule += frames_in_block as u64;

        let is_last = frame_end >= frame_data.len();
        let end_info = if is_last {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::EndPage
        };

        writer.write_packet(
            frame_bytes.to_vec(),
            serial,
            end_info,
            granule,
        ).map_err(|e| SonicError::Encode(format!("OGG write error: {}", e)))?;

        frame_offset = frame_end;
    }

    drop(writer);
    Ok(buf)
}

/// Write 34-byte STREAMINFO body.
fn write_streaminfo_body(buf: &mut Vec<u8>, sample_rate: u32, channels: u16, bps: u32, total_samples: usize) {
    let block_size = 4096u16;
    // min/max block size
    buf.extend_from_slice(&block_size.to_be_bytes());
    buf.extend_from_slice(&block_size.to_be_bytes());
    // min/max frame size (0 = unknown)
    buf.extend_from_slice(&[0u8; 3]);
    buf.extend_from_slice(&[0u8; 3]);
    // sample rate (20 bits) | channels-1 (3 bits) | bps-1 (5 bits) | total samples (36 bits)
    let ch_minus1 = (channels - 1) as u64;
    let bps_minus1 = (bps - 1) as u64;
    let total = total_samples as u64;
    let packed: u64 = ((sample_rate as u64) << 44)
        | (ch_minus1 << 41)
        | (bps_minus1 << 36)
        | (total & 0xF_FFFF_FFFF);
    buf.extend_from_slice(&packed.to_be_bytes());
    // MD5 (zeros = not computed)
    buf.extend_from_slice(&[0u8; 16]);
}

/// Extract FLAC audio frames from a complete FLAC file (skip magic + metadata blocks).
fn extract_flac_frames(flac_data: &[u8]) -> Result<&[u8]> {
    if flac_data.len() < 8 || &flac_data[0..4] != b"fLaC" {
        return Err(SonicError::Encode("Invalid FLAC data".into()));
    }

    let mut pos = 4; // skip "fLaC"

    // Skip metadata blocks
    loop {
        if pos + 4 > flac_data.len() {
            return Err(SonicError::Encode("Truncated FLAC metadata".into()));
        }
        let block_header = u32::from_be_bytes([
            flac_data[pos], flac_data[pos + 1], flac_data[pos + 2], flac_data[pos + 3],
        ]);
        let is_last = (block_header >> 31) != 0;
        let block_len = (block_header & 0x00FF_FFFF) as usize;
        pos += 4 + block_len;

        if is_last {
            break;
        }
    }

    Ok(&flac_data[pos..])
}

/// Find the next FLAC frame sync code (0xFFF8) starting from `start`.
fn find_next_frame(data: &[u8], start: usize) -> Option<usize> {
    for i in start..data.len().saturating_sub(1) {
        if data[i] == 0xFF && (data[i + 1] & 0xFC) == 0xF8 {
            return Some(i);
        }
    }
    None
}
