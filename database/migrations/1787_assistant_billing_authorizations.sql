CREATE TABLE IF NOT EXISTS assistant_billing_rules (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 revision INT NOT NULL DEFAULT 1,
 status ENUM('active','revoked') NOT NULL DEFAULT 'active',
 authorized_by_user_id INT NOT NULL,
 authorized_by_name VARCHAR(255) NOT NULL,
 agency_ids_json JSON NOT NULL,
 instructions_json JSON NOT NULL,
 authorized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 revoked_at DATETIME(3) NULL
);
CREATE TABLE IF NOT EXISTS assistant_billing_batches (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 ref CHAR(36) NOT NULL UNIQUE,
 rule_id BIGINT NOT NULL,
 rule_revision INT NOT NULL,
 account_id INT NOT NULL,
 account_revision INT NOT NULL,
 agency_id INT NOT NULL,
 requested_by_user_id INT NOT NULL,
 requested_by_name VARCHAR(255) NOT NULL,
 state ENUM('prepared','processing','completed','reconciliation_required') NOT NULL DEFAULT 'prepared',
 packet_encrypted LONGTEXT NOT NULL,
 results_json JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 expires_at DATETIME(3) NOT NULL,
 completed_at DATETIME(3) NULL,
 KEY ix_assistant_billing_queue(account_id,state,expires_at)
);
