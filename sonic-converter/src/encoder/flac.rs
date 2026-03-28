/// FLAC encoder — writes valid FLAC files using verbatim subframes.
///
/// Produces uncompressed FLAC (verbatim coding per subframe). Every FLAC
/// decoder accepts this; the output is ~1.5× the size of compressed FLAC
/// but always bit-exact and requires no complex prediction/entropy coding.
///
/// Spec reference: https://xiph.org/flac/format.html

use crate::error::{Result, SonicError};
use crate::types::BitDepth;

const FLAC_MAGIC: &[u8; 4] = b"fLaC";
const BLOCK_SIZE: usize = 4096; // frames per FLAC block

/// Encode interleaved f32 PCM samples into a complete FLAC file.
pub fn encode_flac(
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
    bit_depth: BitDepth,
) -> Result<Vec<u8>> {
    if channels == 0 || channels > 8 {
        return Err(SonicError::Encode(format!(
            "FLAC supports 1-8 channels, got {}",
            channels
        )));
    }
    if sample_rate == 0 || sample_rate > 655_350 {
        return Err(SonicError::Encode(format!(
            "Invalid sample rate: {}",
            sample_rate
        )));
    }

    let bps = bit_depth.bits() as u32;
    let ch = channels as usize;
    let total_frames = samples.len() / ch;

    let mut buf: Vec<u8> = Vec::with_capacity(samples.len() * (bps as usize / 8) + 8192);

    // 1. Magic
    buf.extend_from_slice(FLAC_MAGIC);

    // 2. METADATA_BLOCK_STREAMINFO (is_last=1, type=0, length=34)
    let streaminfo_header: u32 = (1 << 31) | 34; // is_last=1, type=0, length=34
    buf.extend_from_slice(&streaminfo_header.to_be_bytes());
    write_streaminfo(&mut buf, sample_rate, channels, bps, total_frames, BLOCK_SIZE);

    // 3. Audio frames
    let mut frame_number: u32 = 0;
    let mut offset = 0;

    while offset < total_frames {
        let remaining = total_frames - offset;
        let block_frames = remaining.min(BLOCK_SIZE);

        let frame_samples = &samples[offset * ch..(offset + block_frames) * ch];
        write_frame(
            &mut buf,
            frame_samples,
            frame_number,
            block_frames,
            sample_rate,
            channels,
            bps,
        )?;

        offset += block_frames;
        frame_number += 1;
    }

    // Patch the MD5 in streaminfo — skip for verbatim encoder (leave zeros).
    // All decoders accept a zero MD5 (means "not computed").

    Ok(buf)
}

/// Write the 34-byte STREAMINFO metadata block body.
fn write_streaminfo(
    buf: &mut Vec<u8>,
    sample_rate: u32,
    channels: u16,
    bps: u32,
    total_frames: usize,
    block_size: usize,
) {
    let min_block = if total_frames < block_size {
        total_frames as u16
    } else {
        block_size as u16
    };
    let max_block = block_size as u16;

    // min/max block size (2 bytes each)
    buf.extend_from_slice(&min_block.to_be_bytes());
    buf.extend_from_slice(&max_block.to_be_bytes());

    // min/max frame size (3 bytes each) — 0 means unknown
    buf.extend_from_slice(&[0u8; 3]); // min frame size
    buf.extend_from_slice(&[0u8; 3]); // max frame size

    // sample rate (20 bits) | channels-1 (3 bits) | bps-1 (5 bits) | total samples (36 bits)
    // = 8 bytes total
    let ch_minus1 = (channels - 1) as u64;
    let bps_minus1 = (bps - 1) as u64;
    let total = total_frames as u64;

    let packed: u64 = ((sample_rate as u64) << 44)
        | (ch_minus1 << 41)
        | (bps_minus1 << 36)
        | (total & 0xF_FFFF_FFFF);

    buf.extend_from_slice(&packed.to_be_bytes());

    // MD5 signature (16 bytes) — all zeros (not computed)
    buf.extend_from_slice(&[0u8; 16]);
}

/// Write one FLAC audio frame with verbatim subframes.
fn write_frame(
    buf: &mut Vec<u8>,
    samples: &[f32],
    frame_number: u32,
    block_frames: usize,
    sample_rate: u32,
    channels: u16,
    bps: u32,
) -> Result<()> {
    let frame_start = buf.len();

    // --- Frame header ---
    // Sync code: 0b11111111_111110xx (14 bits = 0x3FFE)
    // reserved: 0 (1 bit), blocking strategy: 0 = fixed (1 bit)
    let sync: u16 = 0xFFF8; // 1111_1111_1111_1000
    buf.extend_from_slice(&sync.to_be_bytes());

    // Block size code (4 bits) | Sample rate code (4 bits) in one byte
    let bs_code = encode_block_size(block_frames);
    let sr_code = encode_sample_rate(sample_rate);
    buf.push((bs_code << 4) | sr_code);

    // Channel assignment (4 bits) | Sample size (3 bits) | reserved (1 bit)
    let ch_code = (channels - 1) as u8; // 0=mono, 1=stereo, ...
    let ss_code = encode_sample_size(bps);
    buf.push((ch_code << 4) | (ss_code << 1));

    // Frame number (UTF-8 coded u32, since blocking_strategy=0)
    write_utf8_u32(buf, frame_number);

    // If block size code was 0b0110 or 0b0111, write the actual block size
    if bs_code == 6 {
        buf.push((block_frames - 1) as u8);
    } else if bs_code == 7 {
        let bs16 = (block_frames - 1) as u16;
        buf.extend_from_slice(&bs16.to_be_bytes());
    }

    // If sample rate code was 0b1100/0b1101/0b1110, write actual sample rate
    if sr_code == 12 {
        buf.push((sample_rate / 1000) as u8);
    } else if sr_code == 13 {
        let hz16 = sample_rate as u16;
        buf.extend_from_slice(&hz16.to_be_bytes());
    } else if sr_code == 14 {
        let hz16 = (sample_rate / 10) as u16;
        buf.extend_from_slice(&hz16.to_be_bytes());
    }

    // Frame header CRC-8
    let header_crc = crc8(&buf[frame_start..]);
    buf.push(header_crc);

    // --- Subframes (one per channel) ---
    let ch = channels as usize;
    for c in 0..ch {
        // Subframe header: 1 zero-padding bit + 6-bit type + 0 wasted-bits flag
        // Verbatim type = 0b000001
        buf.push(0b0000_0010); // 0(pad) 000001(verbatim) 0(no wasted bits)

        // Write raw samples for this channel
        for f in 0..block_frames {
            let sample = samples[f * ch + c];
            write_sample(buf, sample, bps)?;
        }
    }

    // Pad to byte boundary (subframes are already byte-aligned for 16/24-bit verbatim)
    // For verbatim with standard bps, we're always byte-aligned.

    // Frame footer: CRC-16 over the entire frame
    let frame_crc = crc16(&buf[frame_start..]);
    buf.extend_from_slice(&frame_crc.to_be_bytes());

    Ok(())
}

/// Write a single sample as a signed integer in big-endian.
fn write_sample(buf: &mut Vec<u8>, sample: f32, bps: u32) -> Result<()> {
    let clamped = sample.clamp(-1.0, 1.0);
    match bps {
        16 => {
            let val = if clamped < 0.0 {
                (clamped * 32768.0) as i16
            } else {
                (clamped * 32767.0) as i16
            };
            buf.extend_from_slice(&val.to_be_bytes());
        }
        24 => {
            let val = if clamped < 0.0 {
                (clamped * 8_388_608.0) as i32
            } else {
                (clamped * 8_388_607.0) as i32
            };
            let bytes = val.to_be_bytes();
            buf.extend_from_slice(&bytes[1..4]); // top 3 bytes of big-endian i32
        }
        32 => {
            // FLAC doesn't support 32-bit float natively — encode as 32-bit integer
            let val = if clamped < 0.0 {
                (clamped as f64 * 2_147_483_648.0) as i32
            } else {
                (clamped as f64 * 2_147_483_647.0) as i32
            };
            buf.extend_from_slice(&val.to_be_bytes());
        }
        _ => {
            return Err(SonicError::Encode(format!(
                "Unsupported bits per sample: {}",
                bps
            )));
        }
    }
    Ok(())
}

/// Encode block size to 4-bit FLAC code.
fn encode_block_size(block_frames: usize) -> u8 {
    match block_frames {
        192 => 1,
        576 => 2,
        1152 => 3,
        2304 => 4,
        4608 => 5,
        256 => 8,
        512 => 9,
        1024 => 10,
        2048 => 11,
        4096 => 12,
        8192 => 13,
        16384 => 14,
        32768 => 15,
        n if n <= 256 => 6,   // 8-bit value follows
        _ => 7,               // 16-bit value follows
    }
}

/// Encode sample rate to 4-bit FLAC code.
fn encode_sample_rate(rate: u32) -> u8 {
    match rate {
        88200 => 1,
        176400 => 2,
        192000 => 3,
        8000 => 4,
        16000 => 5,
        22050 => 6,
        24000 => 7,
        32000 => 8,
        44100 => 9,
        48000 => 10,
        96000 => 11,
        // Non-standard rates: encode inline
        r if r % 1000 == 0 && r / 1000 <= 255 => 12, // kHz in 8 bits
        r if r <= 65535 => 13, // Hz in 16 bits
        r if r % 10 == 0 && r / 10 <= 65535 => 14, // tens of Hz in 16 bits
        _ => 0, // get from STREAMINFO
    }
}

/// Encode sample size (bits per sample) to 3-bit FLAC code.
fn encode_sample_size(bps: u32) -> u8 {
    match bps {
        8 => 1,
        12 => 2,
        16 => 4,
        20 => 5,
        24 => 6,
        32 => 7,
        _ => 0, // get from STREAMINFO
    }
}

/// Write a u32 value in FLAC's UTF-8-like coding.
fn write_utf8_u32(buf: &mut Vec<u8>, val: u32) {
    if val < 0x80 {
        buf.push(val as u8);
    } else if val < 0x800 {
        buf.push(0xC0 | ((val >> 6) as u8));
        buf.push(0x80 | ((val & 0x3F) as u8));
    } else if val < 0x10000 {
        buf.push(0xE0 | ((val >> 12) as u8));
        buf.push(0x80 | (((val >> 6) & 0x3F) as u8));
        buf.push(0x80 | ((val & 0x3F) as u8));
    } else if val < 0x200000 {
        buf.push(0xF0 | ((val >> 18) as u8));
        buf.push(0x80 | (((val >> 12) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 6) & 0x3F) as u8));
        buf.push(0x80 | ((val & 0x3F) as u8));
    } else if val < 0x4000000 {
        buf.push(0xF8 | ((val >> 24) as u8));
        buf.push(0x80 | (((val >> 18) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 12) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 6) & 0x3F) as u8));
        buf.push(0x80 | ((val & 0x3F) as u8));
    } else {
        buf.push(0xFC | ((val >> 30) as u8));
        buf.push(0x80 | (((val >> 24) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 18) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 12) & 0x3F) as u8));
        buf.push(0x80 | (((val >> 6) & 0x3F) as u8));
        buf.push(0x80 | ((val & 0x3F) as u8));
    }
}

/// CRC-8 with polynomial 0x07 (FLAC frame header).
fn crc8(data: &[u8]) -> u8 {
    let mut crc: u8 = 0;
    for &byte in data {
        crc ^= byte;
        for _ in 0..8 {
            if crc & 0x80 != 0 {
                crc = (crc << 1) ^ 0x07;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// CRC-16 with polynomial 0x8005 (FLAC frame footer).
fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ 0x8005;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}
