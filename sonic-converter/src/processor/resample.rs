/// Audio resampling using rubato — high-quality sinc interpolation.
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};

use crate::error::{Result, SonicError};

/// Resample interleaved f32 audio samples from one sample rate to another.
///
/// Returns the resampled samples (interleaved) if `target_rate != source_rate`.
/// If rates are equal, returns `None` (no resampling needed — use original data).
pub fn resample_audio(
    samples: &[f32],
    channels: u16,
    source_rate: u32,
    target_rate: u32,
) -> Result<Option<Vec<f32>>> {
    if source_rate == target_rate || target_rate == 0 {
        return Ok(None);
    }

    let ch = channels as usize;
    if ch == 0 {
        return Err(SonicError::InvalidInput("Channel count must be > 0".into()));
    }

    let num_frames = samples.len() / ch;
    if num_frames == 0 {
        return Ok(Some(Vec::new()));
    }

    // De-interleave: convert from [L R L R ...] to [[L L ...], [R R ...]]
    let mut channel_data: Vec<Vec<f32>> = vec![Vec::with_capacity(num_frames); ch];
    for frame in 0..num_frames {
        for c in 0..ch {
            channel_data[c].push(samples[frame * ch + c]);
        }
    }

    // Configure sinc resampler
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = target_rate as f64 / source_rate as f64;

    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0,       // max relative ratio (allows up to 2x changes dynamically)
        params,
        num_frames, // chunk size = full input (single-pass for simplicity)
        ch,
    )
    .map_err(|e| SonicError::Encode(format!("Failed to create resampler: {}", e)))?;

    // Convert Vec<Vec<f32>> to Vec<&[f32]> for rubato
    let channel_refs: Vec<&[f32]> = channel_data.iter().map(|c| c.as_slice()).collect();

    let resampled = resampler
        .process(&channel_refs, None)
        .map_err(|e| SonicError::Encode(format!("Resampling failed: {}", e)))?;

    // Re-interleave: convert from [[L L ...], [R R ...]] to [L R L R ...]
    let output_frames = resampled[0].len();
    let mut interleaved = Vec::with_capacity(output_frames * ch);
    for frame in 0..output_frames {
        for c in 0..ch {
            interleaved.push(resampled[c][frame]);
        }
    }

    Ok(Some(interleaved))
}
