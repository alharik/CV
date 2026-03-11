/// Webhook delivery for Sonic Converter API.
///
/// Business and Unlimited tiers can register webhook URLs to receive
/// notifications after successful conversions.
///
/// Webhooks are signed with HMAC-SHA256 and delivered asynchronously.

use serde_json::json;
use sha2::Sha256;
use hmac::{Hmac, Mac};
use tracing::{error, info, warn};

type HmacSha256 = Hmac<Sha256>;

/// Payload sent to webhook endpoints.
#[derive(Clone, Debug)]
pub struct WebhookPayload {
    pub event: String,
    pub input_size: u64,
    pub output_size: u64,
    pub elapsed_ms: u64,
    pub bit_depth: u8,
    pub timestamp: String,
}

/// Deliver a webhook payload to the given URL, signed with the secret.
pub async fn deliver(
    url: &str,
    secret: &str,
    payload: &WebhookPayload,
) -> Result<(), String> {
    let body = json!({
        "event": payload.event,
        "data": {
            "input_size": payload.input_size,
            "output_size": payload.output_size,
            "elapsed_ms": payload.elapsed_ms,
            "bit_depth": payload.bit_depth,
            "timestamp": payload.timestamp,
        }
    });

    let body_bytes = body.to_string();

    // Sign the payload with HMAC-SHA256
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| format!("HMAC error: {e}"))?;
    mac.update(body_bytes.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    // Send the webhook (with timeout and retries)
    let client = reqwest::Client::new();
    let mut last_err = String::new();

    for attempt in 1..=3 {
        match client
            .post(url)
            .header("Content-Type", "application/json")
            .header("X-Sonic-Signature", &signature)
            .header("X-Sonic-Event", &payload.event)
            .header("User-Agent", "SonicConverter-Webhook/1.0")
            .body(body_bytes.clone())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() || status.is_redirection() {
                    info!(url, attempt, status = %status, "Webhook delivered");
                    return Ok(());
                } else {
                    last_err = format!("HTTP {status}");
                    warn!(url, attempt, status = %status, "Webhook delivery failed, retrying");
                }
            }
            Err(e) => {
                last_err = e.to_string();
                warn!(url, attempt, error = %e, "Webhook delivery error, retrying");
            }
        }

        // Exponential backoff: 1s, 2s, 4s
        if attempt < 3 {
            tokio::time::sleep(std::time::Duration::from_secs(1 << (attempt - 1))).await;
        }
    }

    error!(url, error = %last_err, "Webhook delivery failed after 3 attempts");
    Err(format!("Webhook delivery failed: {last_err}"))
}
