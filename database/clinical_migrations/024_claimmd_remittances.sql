-- ERA data stays in the clinical plane, encrypted with agency/record-bound AAD.
CREATE TABLE IF NOT EXISTS claimmd_remittances (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 agency_id INT NOT NULL,
 connection_id VARCHAR(120) NOT NULL,
 era_id VARCHAR(128) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 payer_id VARCHAR(32) NOT NULL,
 billing_npi VARCHAR(10) NOT NULL,
 paid_date DATE NULL,
 paid_cents BIGINT NOT NULL,
 difference_cents BIGINT NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL DEFAULT 'review',
 payload_encrypted LONGTEXT NOT NULL,
 imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by_user_id INT NULL,
 review_encrypted LONGTEXT NULL,
 UNIQUE KEY uq_remittance(agency_id,connection_id,era_id),
 INDEX ix_remittance_queue(agency_id,status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS claimmd_remittance_items (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 agency_id INT NOT NULL,
 remittance_id BIGINT NOT NULL,
 item_index INT NOT NULL,
 clinical_claim_id BIGINT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'unmatched',
 payload_encrypted LONGTEXT NOT NULL,
 reviewed_by_user_id INT NULL,
 review_encrypted LONGTEXT NULL,
 UNIQUE KEY uq_remittance_item(remittance_id,item_index),
 INDEX ix_remittance_claim(agency_id,clinical_claim_id),
 FOREIGN KEY(remittance_id) REFERENCES claimmd_remittances(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS claimmd_payment_postings (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 agency_id INT NOT NULL,
 remittance_item_id BIGINT NOT NULL,
 clinical_claim_id BIGINT NULL,
 kind VARCHAR(24) NOT NULL,
 paid_cents BIGINT NOT NULL,
 adjustment_cents BIGINT NOT NULL,
 responsibility_cents BIGINT NOT NULL,
 reverses_posting_id BIGINT NULL,
 posted_by_user_id INT NOT NULL,
 posted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_posting_item(remittance_item_id),
 UNIQUE KEY uq_posting_reversal(reverses_posting_id),
 INDEX ix_posting_claim(agency_id,clinical_claim_id,id),
 FOREIGN KEY(remittance_item_id) REFERENCES claimmd_remittance_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Durable outbox: patient balances live in the separate application database.
CREATE TABLE IF NOT EXISTS claimmd_responsibility_jobs (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 posting_id BIGINT NOT NULL,
 agency_id INT NOT NULL,
 clinical_claim_id BIGINT NOT NULL,
 amount_cents BIGINT NOT NULL,
 action VARCHAR(24) NOT NULL DEFAULT 'set',
 status VARCHAR(24) NOT NULL DEFAULT 'pending',
 error_message VARCHAR(1000) NULL,
 actor_user_id INT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_responsibility_posting(posting_id),
 INDEX ix_responsibility_work(agency_id,status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS claimmd_era_sync_state (
 agency_id INT NOT NULL,
 connection_id VARCHAR(120) NOT NULL,
 last_era_id VARCHAR(128) NOT NULL DEFAULT '0',
 last_success_at DATETIME NULL,
 PRIMARY KEY(agency_id,connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
