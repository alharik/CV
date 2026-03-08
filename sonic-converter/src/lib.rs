/// Sonic Converter — Production-grade MP3 to WAV conversion.
///
/// # Quick Start
/// ```no_run
/// // One-liner conversion
/// sonic_converter::convert("input.mp3", "output.wav").unwrap();
///
/// // In-memory conversion
/// let mp3_bytes = std::fs::read("input.mp3").unwrap();
/// let wav_bytes = sonic_converter::convert_bytes(&mp3_bytes).unwrap();
/// ```

pub mod decoder;
pub mod encoder;
pub mod error;
pub mod pipeline;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use error::{Result, SonicError};
pub use types::{AudioMetadata, BitDepth, Channels, ConversionResult, Progress};

use std::fs;
use std::path::Path;
use std::time::Instant;

/// Convert an MP3 file to WAV with default settings (16-bit PCM).
///
/// # Example
/// ```no_run
/// sonic_converter::convert("input.mp3", "output.wav").unwrap();
/// ```
pub fn convert<P: AsRef<Path>>(input: P, output: P) -> Result<ConversionResult> {
    Converter::new().convert_file(input, output)
}

/// Convert MP3 bytes to WAV bytes in memory (16-bit PCM).
///
/// Ideal for server-side processing where files are already in memory.
///
/// # Example
/// ```no_run
/// let mp3_data = std::fs::read("input.mp3").unwrap();
/// let wav_data = sonic_converter::convert_bytes(&mp3_data).unwrap();
/// ```
pub fn convert_bytes(mp3_data: &[u8]) -> Result<Vec<u8>> {
    Converter::new().convert_bytes(mp3_data)
}

/// Convert MP3 bytes to WAV bytes with a progress callback.
pub fn convert_bytes_with_progress<F>(mp3_data: &[u8], on_progress: F) -> Result<Vec<u8>>
where
    F: FnMut(Progress) + 'static,
{
    Converter::new()
        .on_progress(on_progress)
        .convert_bytes(mp3_data)
}

/// Builder for configuring MP3 → WAV conversion.
///
/// # Example
/// ```no_run
/// use sonic_converter::{Converter, BitDepth, Channels};
///
/// let result = Converter::new()
///     .bit_depth(BitDepth::F32)
///     .channels(Channels::Stereo)
///     .convert_file("input.mp3", "output.wav")
///     .unwrap();
///
/// println!("Converted in {}ms", result.elapsed_ms);
/// ```
pub struct Converter {
    bit_depth: BitDepth,
    channels: Channels,
    sample_rate: Option<u32>,
    on_progress: Option<Box<dyn FnMut(Progress)>>,
}

impl Converter {
    /// Create a new converter with default settings.
    pub fn new() -> Self {
        Self {
            bit_depth: BitDepth::I16,
            channels: Channels::Original,
            sample_rate: None,
            on_progress: None,
        }
    }

    /// Set the output bit depth.
    pub fn bit_depth(mut self, depth: BitDepth) -> Self {
        self.bit_depth = depth;
        self
    }

    /// Set the output channel configuration.
    pub fn channels(mut self, channels: Channels) -> Self {
        self.channels = channels;
        self
    }

    /// Set the output sample rate (resampling not yet implemented — preserves original).
    pub fn sample_rate(mut self, rate: u32) -> Self {
        self.sample_rate = Some(rate);
        self
    }

    /// Set a progress callback.
    pub fn on_progress<F: FnMut(Progress) + 'static>(mut self, f: F) -> Self {
        self.on_progress = Some(Box::new(f));
        self
    }

    /// Convert an MP3 file to a WAV file.
    pub fn convert_file<P: AsRef<Path>>(mut self, input: P, output: P) -> Result<ConversionResult> {
        let start = Instant::now();

        let mp3_data = fs::read(input.as_ref())?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 10,
                bytes_decoded: 0,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Decoding",
            });
        }

        let decoded = decoder::decode_mp3(&mp3_data)?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 60,
                bytes_decoded: mp3_data.len() as u64,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Encoding WAV",
            });
        }

        let channels = self.channels.resolve(decoded.channels);
        let wav_data =
            encoder::wav::encode_wav(&decoded.samples, decoded.sample_rate, channels, self.bit_depth)?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 90,
                bytes_decoded: mp3_data.len() as u64,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Writing file",
            });
        }

        let output_size = wav_data.len() as u64;
        fs::write(output.as_ref(), &wav_data)?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 100,
                bytes_decoded: mp3_data.len() as u64,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Complete",
            });
        }

        Ok(ConversionResult {
            output_path: Some(output.as_ref().to_string_lossy().into()),
            output_size,
            metadata: decoded.metadata,
            elapsed_ms: start.elapsed().as_millis() as u64,
        })
    }

    /// Convert MP3 bytes to WAV bytes in memory.
    pub fn convert_bytes(mut self, mp3_data: &[u8]) -> Result<Vec<u8>> {
        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 10,
                bytes_decoded: 0,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Decoding",
            });
        }

        let decoded = decoder::decode_mp3(mp3_data)?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 70,
                bytes_decoded: mp3_data.len() as u64,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Encoding WAV",
            });
        }

        let channels = self.channels.resolve(decoded.channels);
        let wav_data =
            encoder::wav::encode_wav(&decoded.samples, decoded.sample_rate, channels, self.bit_depth)?;

        if let Some(ref mut cb) = self.on_progress {
            cb(Progress {
                percent: 100,
                bytes_decoded: mp3_data.len() as u64,
                total_bytes: Some(mp3_data.len() as u64),
                phase: "Complete",
            });
        }

        Ok(wav_data)
    }
}

impl Default for Converter {
    fn default() -> Self {
        Self::new()
    }
}

/// Batch convert all MP3 files in a directory (requires `parallel` feature).
#[cfg(feature = "parallel")]
pub fn batch_convert<P: AsRef<Path>>(
    input_dir: P,
    output_dir: P,
) -> pipeline::batch::BatchConverter {
    pipeline::batch::BatchConverter::new(input_dir, output_dir)
}
