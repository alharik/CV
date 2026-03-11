/// Database layer for Sonic Converter API — Turso (libSQL) backed.
///
/// Handles:
///   - API key validation (SHA-256 hashed keys)
///   - Usage logging (per-request)
///   - Monthly usage aggregation and quota enforcement
///   - Key provisioning

use sha2::{Digest, Sha256};
use std::sync::Arc;
use tracing::{error, info};

/// Hashes an API key with SHA-256 for storage (never store raw keys).
pub fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// First 8 chars of the key for human-readable identification.
pub fn key_prefix(key: &str) -> String {
    key.chars().take(8).collect()
}

#[derive(Clone)]
pub struct Database {
    db: Arc<libsql::Database>,
}

#[derive(Debug, Clone)]
pub struct MonthlyUsage {
    pub conversion_count: u32,
    pub info_count: u32,
    pub total_bytes_in: u64,
    pub total_bytes_out: u64,
}

impl Database {
    /// Connect to Turso and run migrations.
    pub async fn connect(url: &str, token: &str) -> Result<Self, String> {
        let db = libsql::Builder::new_remote(url.to_string(), token.to_string())
            .build()
            .await
            .map_err(|e| format!("Failed to connect to Turso: {e}"))?;

        let this = Self { db: Arc::new(db) };
        this.run_migrations().await?;
        info!("Database connected and migrations applied");
        Ok(this)
    }

    /// Connect to a local SQLite file (for dev/testing).
    pub async fn connect_local(path: &str) -> Result<Self, String> {
        let db = libsql::Builder::new_local(path)
            .build()
            .await
            .map_err(|e| format!("Failed to open local DB: {e}"))?;

        let this = Self { db: Arc::new(db) };
        this.run_migrations().await?;
        info!(path, "Local database connected");
        Ok(this)
    }

    async fn conn(&self) -> Result<libsql::Connection, String> {
        self.db
            .connect()
            .map_err(|e| format!("DB connection error: {e}"))
    }

    async fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn().await?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS api_keys (
                key_hash TEXT PRIMARY KEY,
                key_prefix TEXT NOT NULL,
                tier TEXT NOT NULL DEFAULT 'free',
                email TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_hash TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                input_size_bytes INTEGER,
                output_size_bytes INTEGER,
                elapsed_ms INTEGER,
                bit_depth INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS monthly_usage (
                key_hash TEXT NOT NULL,
                month TEXT NOT NULL,
                conversion_count INTEGER NOT NULL DEFAULT 0,
                info_count INTEGER NOT NULL DEFAULT 0,
                total_bytes_in INTEGER NOT NULL DEFAULT 0,
                total_bytes_out INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (key_hash, month)
            );

            CREATE INDEX IF NOT EXISTS idx_usage_log_key_hash ON usage_log(key_hash);
            CREATE INDEX IF NOT EXISTS idx_usage_log_created ON usage_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_monthly_usage_month ON monthly_usage(month);
            ",
        )
        .await
        .map_err(|e| format!("Migration error: {e}"))?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // API Key Management
    // -----------------------------------------------------------------------

    /// Validate an API key. Returns the tier if the key exists and is active.
    pub async fn validate_key(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn().await?;
        let hash = hash_key(key);

        let mut rows = conn
            .query(
                "SELECT tier FROM api_keys WHERE key_hash = ?1 AND is_active = 1",
                libsql::params![hash],
            )
            .await
            .map_err(|e| format!("Query error: {e}"))?;

        if let Some(row) = rows.next().await.map_err(|e| format!("Row error: {e}"))? {
            let tier: String = row.get(0).map_err(|e| format!("Column error: {e}"))?;
            Ok(Some(tier))
        } else {
            Ok(None)
        }
    }

    /// Create a new API key entry in the database.
    pub async fn create_key(
        &self,
        key: &str,
        tier: &str,
        email: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn().await?;
        let hash = hash_key(key);
        let prefix = key_prefix(key);

        conn.execute(
            "INSERT OR REPLACE INTO api_keys (key_hash, key_prefix, tier, email) VALUES (?1, ?2, ?3, ?4)",
            libsql::params![hash, prefix.clone(), tier, email.unwrap_or("")],
        )
        .await
        .map_err(|e| format!("Insert error: {e}"))?;

        info!(key_prefix = %prefix, tier, "API key created in database");
        Ok(())
    }

    /// Migrate keys from environment variable HashMap into the database.
    pub async fn migrate_env_keys(
        &self,
        keys: &std::collections::HashMap<String, String>,
    ) -> Result<u32, String> {
        let mut count = 0;
        for (key, tier) in keys {
            self.create_key(key, tier, None).await?;
            count += 1;
        }
        info!(count, "Migrated environment keys to database");
        Ok(count)
    }

    // -----------------------------------------------------------------------
    // Usage Logging
    // -----------------------------------------------------------------------

    /// Log a single API request (fire-and-forget, errors are logged but not propagated).
    pub async fn log_usage(
        &self,
        key: &str,
        endpoint: &str,
        status_code: u16,
        input_size: Option<u64>,
        output_size: Option<u64>,
        elapsed_ms: Option<u64>,
        bit_depth: Option<u8>,
    ) {
        let hash = hash_key(key);
        let month = chrono::Utc::now().format("%Y-%m").to_string();

        let conn = match self.conn().await {
            Ok(c) => c,
            Err(e) => {
                error!(error = %e, "Failed to get DB connection for usage logging");
                return;
            }
        };

        // Insert detailed log
        if let Err(e) = conn
            .execute(
                "INSERT INTO usage_log (key_hash, endpoint, status_code, input_size_bytes, output_size_bytes, elapsed_ms, bit_depth)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                libsql::params![
                    hash.clone(),
                    endpoint,
                    status_code as i64,
                    input_size.map(|v| v as i64),
                    output_size.map(|v| v as i64),
                    elapsed_ms.map(|v| v as i64),
                    bit_depth.map(|v| v as i64),
                ],
            )
            .await
        {
            error!(error = %e, "Failed to insert usage log");
            return;
        }

        // Update monthly aggregation
        let is_convert = endpoint.contains("convert");
        let convert_inc = if is_convert { 1 } else { 0 };
        let info_inc = if !is_convert { 1 } else { 0 };
        let bytes_in = input_size.unwrap_or(0) as i64;
        let bytes_out = output_size.unwrap_or(0) as i64;

        if let Err(e) = conn
            .execute(
                "INSERT INTO monthly_usage (key_hash, month, conversion_count, info_count, total_bytes_in, total_bytes_out)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(key_hash, month) DO UPDATE SET
                     conversion_count = conversion_count + ?3,
                     info_count = info_count + ?4,
                     total_bytes_in = total_bytes_in + ?5,
                     total_bytes_out = total_bytes_out + ?6",
                libsql::params![hash, month, convert_inc, info_inc, bytes_in, bytes_out],
            )
            .await
        {
            error!(error = %e, "Failed to update monthly usage");
        }
    }

    // -----------------------------------------------------------------------
    // Usage Queries
    // -----------------------------------------------------------------------

    /// Get the current month's usage for a key.
    pub async fn get_monthly_usage(&self, key: &str) -> Result<MonthlyUsage, String> {
        let conn = self.conn().await?;
        let hash = hash_key(key);
        let month = chrono::Utc::now().format("%Y-%m").to_string();

        let mut rows = conn
            .query(
                "SELECT conversion_count, info_count, total_bytes_in, total_bytes_out
                 FROM monthly_usage WHERE key_hash = ?1 AND month = ?2",
                libsql::params![hash, month],
            )
            .await
            .map_err(|e| format!("Query error: {e}"))?;

        if let Some(row) = rows.next().await.map_err(|e| format!("Row error: {e}"))? {
            Ok(MonthlyUsage {
                conversion_count: row.get::<i64>(0).unwrap_or(0) as u32,
                info_count: row.get::<i64>(1).unwrap_or(0) as u32,
                total_bytes_in: row.get::<i64>(2).unwrap_or(0) as u64,
                total_bytes_out: row.get::<i64>(3).unwrap_or(0) as u64,
            })
        } else {
            Ok(MonthlyUsage {
                conversion_count: 0,
                info_count: 0,
                total_bytes_in: 0,
                total_bytes_out: 0,
            })
        }
    }
}
