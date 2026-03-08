/// Parallel batch conversion using rayon.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;

use crate::error::{Result, SonicError};
use crate::types::{BitDepth, ConversionResult};

/// Result for a single file in a batch.
#[derive(Debug)]
pub struct BatchFileResult {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub result: std::result::Result<ConversionResult, SonicError>,
}

/// Batch converter builder.
pub struct BatchConverter {
    input_dir: PathBuf,
    output_dir: PathBuf,
    bit_depth: BitDepth,
    threads: Option<usize>,
    on_file_complete: Option<Box<dyn Fn(&BatchFileResult) + Send + Sync>>,
}

impl BatchConverter {
    pub fn new<P: AsRef<Path>>(input_dir: P, output_dir: P) -> Self {
        Self {
            input_dir: input_dir.as_ref().to_path_buf(),
            output_dir: output_dir.as_ref().to_path_buf(),
            bit_depth: BitDepth::I16,
            threads: None,
            on_file_complete: None,
        }
    }

    /// Set output bit depth.
    pub fn bit_depth(mut self, depth: BitDepth) -> Self {
        self.bit_depth = depth;
        self
    }

    /// Set number of threads (defaults to all available cores).
    pub fn threads(mut self, n: usize) -> Self {
        self.threads = Some(n);
        self
    }

    /// Set callback for each completed file.
    pub fn on_file_complete<F>(mut self, f: F) -> Self
    where
        F: Fn(&BatchFileResult) + Send + Sync + 'static,
    {
        self.on_file_complete = Some(Box::new(f));
        self
    }

    /// Run the batch conversion.
    pub fn run(self) -> Result<Vec<BatchFileResult>> {
        // Create output directory
        fs::create_dir_all(&self.output_dir)?;

        // Find all MP3 files
        let mp3_files: Vec<PathBuf> = fs::read_dir(&self.input_dir)?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("mp3") {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        if mp3_files.is_empty() {
            return Ok(Vec::new());
        }

        // Configure thread pool if specified
        let pool = if let Some(n) = self.threads {
            Some(
                rayon::ThreadPoolBuilder::new()
                    .num_threads(n)
                    .build()
                    .map_err(|e| SonicError::Decode(format!("Thread pool error: {}", e)))?,
            )
        } else {
            None
        };

        let output_dir = self.output_dir.clone();
        let bit_depth = self.bit_depth;
        let callback = self.on_file_complete.map(Arc::new);
        let completed = Arc::new(AtomicUsize::new(0));

        let convert_fn = |files: &[PathBuf]| -> Vec<BatchFileResult> {
            files
                .par_iter()
                .map(|input_path| {
                    let start = Instant::now();
                    let file_stem = input_path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy();
                    let output_path = output_dir.join(format!("{}.wav", file_stem));

                    let result = (|| -> Result<ConversionResult> {
                        let mp3_data = fs::read(input_path)?;
                        let decoded = crate::decoder::decode_mp3(&mp3_data)?;
                        let wav_data = crate::encoder::wav::encode_wav(
                            &decoded.samples,
                            decoded.sample_rate,
                            decoded.channels,
                            bit_depth,
                        )?;
                        let output_size = wav_data.len() as u64;
                        fs::write(&output_path, &wav_data)?;

                        Ok(ConversionResult {
                            output_path: Some(output_path.to_string_lossy().into()),
                            output_size,
                            metadata: decoded.metadata,
                            elapsed_ms: start.elapsed().as_millis() as u64,
                        })
                    })();

                    let batch_result = BatchFileResult {
                        input_path: input_path.clone(),
                        output_path: output_path.clone(),
                        result,
                    };

                    completed.fetch_add(1, Ordering::Relaxed);

                    if let Some(ref cb) = callback {
                        cb(&batch_result);
                    }

                    batch_result
                })
                .collect()
        };

        let results = if let Some(pool) = pool {
            pool.install(|| convert_fn(&mp3_files))
        } else {
            convert_fn(&mp3_files)
        };

        Ok(results)
    }
}
