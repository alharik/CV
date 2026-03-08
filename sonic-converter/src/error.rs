/// Error types for sonic-converter.
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SonicError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("Decode error: {0}")]
    Decode(String),

    #[error("Encode error: {0}")]
    Encode(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("No audio track found in input")]
    NoAudioTrack,

    #[error("Conversion cancelled")]
    Cancelled,
}

/// Convenience Result type for sonic-converter.
pub type Result<T> = std::result::Result<T, SonicError>;
