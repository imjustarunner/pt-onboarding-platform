-- Agency expenses only; no patient surcharge. Each revision is immutable.
CREATE TABLE medical_service_fee_agreements (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 revision INT UNSIGNED NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 claim_unit_cents INT UNSIGNED NOT NULL DEFAULT 0,
 eligibility_unit_cents INT UNSIGNED NOT NULL DEFAULT 0,
 card_fee_bps INT UNSIGNED NOT NULL DEFAULT 0,
 card_fixed_cents INT UNSIGNED NOT NULL DEFAULT 0,
 contract_reference VARCHAR(1000) NOT NULL,
 effective_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 created_by_user_id INT NOT NULL,
 UNIQUE KEY uq_medical_fee_revision (agency_id,revision),
 INDEX idx_medical_fee_effective (agency_id,effective_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE medical_service_usage (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 kind ENUM('claim','eligibility') NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 agreement_id BIGINT UNSIGNED NULL,
 unit_cents INT UNSIGNED NOT NULL DEFAULT 0,
 status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 invoice_id BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_medical_service_source (agency_id,kind,source_id),
 INDEX idx_medical_service_invoice (agency_id,invoice_id,status,completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE medical_service_card_quotes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 request_hash CHAR(64) NOT NULL,
 connected_account_id VARCHAR(128) NOT NULL,
 amount_cents BIGINT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL,
 agreement_id BIGINT UNSIGNED NULL,
 fee_cents BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_medical_card_quote (agency_id,request_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
