/// Shared types for audio conversion.

/// Bit depth of output WAV samples.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BitDepth {
    /// 16-bit signed integer PCM (most common, CD quality)
    I16,
    /// 24-bit signed integer PCM (professional audio)
    I24,
    /// 32-bit floating point PCM (maximum quality, DAW native)
    F32,
}

impl BitDepth {
    /// Bytes per sample for this bit depth.
    pub fn bytes_per_sample(self) -> u16 {
        match self {
            BitDepth::I16 => 2,
            BitDepth::I24 => 3,
            BitDepth::F32 => 4,
        }
    }

    /// WAV format tag (1 = PCM integer, 3 = IEEE float).
    pub fn wav_format_tag(self) -> u16 {
        match self {
            BitDepth::I16 | BitDepth::I24 => 1,
            BitDepth::F32 => 3,
        }
    }

    /// Bits per sample.
    pub fn bits(self) -> u16 {
        match self {
            BitDepth::I16 => 16,
            BitDepth::I24 => 24,
            BitDepth::F32 => 32,
        }
    }
}

/// Channel configuration for output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channels {
    /// Mono (1 channel)
    Mono,
    /// Stereo (2 channels)
    Stereo,
    /// Preserve original channel count from source
    Original,
}

impl Channels {
    /// Resolve to actual channel count given the source channel count.
    pub fn resolve(self, source_channels: u16) -> u16 {
        match self {
            Channels::Mono => 1,
            Channels::Stereo => 2,
            Channels::Original => source_channels,
        }
    }
}

/// Progress information passed to callbacks.
#[derive(Debug, Clone)]
pub struct Progress {
    /// Percentage complete (0-100).
    pub percent: u8,
    /// Bytes decoded so far.
    pub bytes_decoded: u64,
    /// Total bytes (if known).
    pub total_bytes: Option<u64>,
    /// Current phase description.
    pub phase: &'static str,
}

/// Metadata extracted from the audio file.
#[derive(Debug, Clone, Default)]
pub struct AudioMetadata {
    /// Sample rate in Hz (e.g., 44100).
    pub sample_rate: u32,
    /// Number of channels.
    pub channels: u16,
    /// Duration in seconds (if known).
    pub duration_secs: Option<f64>,
    /// Bitrate in kbps (if known).
    pub bitrate_kbps: Option<u32>,
    /// Whether the source is VBR.
    pub is_vbr: Option<bool>,
}

/// Result of a completed conversion.
#[derive(Debug, Clone)]
pub struct ConversionResult {
    /// Output file path (if file-based conversion).
    pub output_path: Option<String>,
    /// Size of the output in bytes.
    pub output_size: u64,
    /// Source audio metadata.
    pub metadata: AudioMetadata,
    /// Conversion time in milliseconds.
    pub elapsed_ms: u64,
}
