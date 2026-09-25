CREATE TABLE agency_bank_feed_customers (
 agency_id INT NOT NULL, livemode TINYINT(1) NOT NULL,
 stripe_customer_id VARCHAR(128) NOT NULL,
 PRIMARY KEY (agency_id,livemode), UNIQUE KEY uq_bank_customer (stripe_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE bank_feed_sessions (
 session_key CHAR(36) NOT NULL PRIMARY KEY,
 agency_id INT NOT NULL, actor_user_id INT NOT NULL,
 stripe_customer_id VARCHAR(128) NOT NULL, livemode TINYINT(1) NOT NULL,
 stripe_session_id VARCHAR(128) NULL,
 shared_account TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE bank_feed_accounts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 external_id VARCHAR(128) NOT NULL,
 stripe_customer_id VARCHAR(128) NOT NULL,
 livemode TINYINT(1) NOT NULL,
 shared_account TINYINT(1) NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 sync_enabled TINYINT(1) NOT NULL DEFAULT 0,
 details_encrypted TEXT NOT NULL,
 last_refresh VARCHAR(128) NULL,
 sync_target_refresh VARCHAR(128) NULL,
 page_cursor VARCHAR(128) NULL,
 last_synced_at DATETIME NULL,
 next_sync_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_error VARCHAR(255) NULL,
 connected_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_feed_external (external_id),
 INDEX idx_bank_feed_agency (agency_id,id),
 INDEX idx_bank_feed_due (sync_enabled,next_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE bank_feed_transactions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 account_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 external_id VARCHAR(128) NOT NULL,
 vendor_updated BIGINT NOT NULL,
 evidence_encrypted TEXT NOT NULL,
 evidence_hash CHAR(64) NOT NULL,
 observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_transaction (account_id,external_id),
 INDEX idx_bank_transaction_agency (agency_id,account_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE bank_feed_transaction_versions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 transaction_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 evidence_encrypted TEXT NOT NULL,
 evidence_hash CHAR(64) NOT NULL,
 observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_transaction_version (transaction_id,evidence_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE bank_deposit_verifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, account_id BIGINT UNSIGNED NOT NULL,
 era_key CHAR(64) NOT NULL,
 era_encrypted TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'awaiting_evidence',
 transaction_id BIGINT UNSIGNED NULL,
 requested_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_era (agency_id,era_key),
 UNIQUE KEY uq_bank_verified_transaction (transaction_id),
 INDEX idx_bank_verification_account (agency_id,account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
