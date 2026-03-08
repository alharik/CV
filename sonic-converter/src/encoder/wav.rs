/// WAV encoder — writes RIFF/WAV headers + PCM sample data.
use std::io::Write;

use crate::error::{Result, SonicError};
use crate::types::BitDepth;

/// Encode interleaved f32 PCM samples into a complete WAV file in memory.
pub fn encode_wav(
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
    bit_depth: BitDepth,
) -> Result<Vec<u8>> {
    let bytes_per_sample = bit_depth.bytes_per_sample();
    let num_samples = samples.len() as u32;
    let data_size = num_samples * bytes_per_sample as u32;
    let file_size = 36 + data_size;

    let block_align = channels * bytes_per_sample;
    let byte_rate = sample_rate * block_align as u32;

    let mut buf: Vec<u8> = Vec::with_capacity(file_size as usize + 8);

    // RIFF header
    buf.write_all(b"RIFF")?;
    buf.write_all(&file_size.to_le_bytes())?;
    buf.write_all(b"WAVE")?;

    // fmt sub-chunk
    buf.write_all(b"fmt ")?;
    buf.write_all(&16u32.to_le_bytes())?; // sub-chunk size
    buf.write_all(&bit_depth.wav_format_tag().to_le_bytes())?; // audio format
    buf.write_all(&channels.to_le_bytes())?;
    buf.write_all(&sample_rate.to_le_bytes())?;
    buf.write_all(&byte_rate.to_le_bytes())?;
    buf.write_all(&block_align.to_le_bytes())?;
    buf.write_all(&bit_depth.bits().to_le_bytes())?;

    // data sub-chunk
    buf.write_all(b"data")?;
    buf.write_all(&data_size.to_le_bytes())?;

    // Write PCM samples
    match bit_depth {
        BitDepth::I16 => {
            write_samples_i16(&mut buf, samples)?;
        }
        BitDepth::I24 => {
            write_samples_i24(&mut buf, samples)?;
        }
        BitDepth::F32 => {
            write_samples_f32(&mut buf, samples)?;
        }
    }

    Ok(buf)
}

/// Write WAV data to a writer (for streaming).
pub fn write_wav_header<W: Write>(
    writer: &mut W,
    sample_rate: u32,
    channels: u16,
    bit_depth: BitDepth,
    total_samples: u32,
) -> Result<()> {
    let bytes_per_sample = bit_depth.bytes_per_sample();
    let data_size = total_samples * bytes_per_sample as u32;
    let file_size = 36 + data_size;
    let block_align = channels * bytes_per_sample;
    let byte_rate = sample_rate * block_align as u32;

    writer.write_all(b"RIFF")?;
    writer.write_all(&file_size.to_le_bytes())?;
    writer.write_all(b"WAVE")?;
    writer.write_all(b"fmt ")?;
    writer.write_all(&16u32.to_le_bytes())?;
    writer.write_all(&bit_depth.wav_format_tag().to_le_bytes())?;
    writer.write_all(&channels.to_le_bytes())?;
    writer.write_all(&sample_rate.to_le_bytes())?;
    writer.write_all(&byte_rate.to_le_bytes())?;
    writer.write_all(&block_align.to_le_bytes())?;
    writer.write_all(&bit_depth.bits().to_le_bytes())?;
    writer.write_all(b"data")?;
    writer.write_all(&data_size.to_le_bytes())?;

    Ok(())
}

/// Write interleaved f32 samples as 16-bit signed PCM.
fn write_samples_i16<W: Write>(writer: &mut W, samples: &[f32]) -> Result<()> {
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let val = if clamped < 0.0 {
            (clamped * 32768.0) as i16
        } else {
            (clamped * 32767.0) as i16
        };
        writer
            .write_all(&val.to_le_bytes())
            .map_err(|e| SonicError::Encode(format!("Write error: {}", e)))?;
    }
    Ok(())
}

/// Write interleaved f32 samples as 24-bit signed PCM.
fn write_samples_i24<W: Write>(writer: &mut W, samples: &[f32]) -> Result<()> {
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let val = if clamped < 0.0 {
            (clamped * 8_388_608.0) as i32
        } else {
            (clamped * 8_388_607.0) as i32
        };
        let bytes = val.to_le_bytes();
        writer
            .write_all(&bytes[0..3])
            .map_err(|e| SonicError::Encode(format!("Write error: {}", e)))?;
    }
    Ok(())
}

/// Write interleaved f32 samples as IEEE 754 float.
fn write_samples_f32<W: Write>(writer: &mut W, samples: &[f32]) -> Result<()> {
    for &s in samples {
        writer
            .write_all(&s.to_le_bytes())
            .map_err(|e| SonicError::Encode(format!("Write error: {}", e)))?;
    }
    Ok(())
}

/// Write samples to a generic writer with the given bit depth (public for streaming).
pub fn write_samples_to_writer<W: Write>(
    writer: &mut W,
    samples: &[f32],
    bit_depth: BitDepth,
) -> Result<()> {
    match bit_depth {
        BitDepth::I16 => write_samples_i16(writer, samples),
        BitDepth::I24 => write_samples_i24(writer, samples),
        BitDepth::F32 => write_samples_f32(writer, samples),
    }
}
