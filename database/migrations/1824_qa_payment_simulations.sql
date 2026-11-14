-- Synthetic QA payment state is separate from external processor records.
CREATE TABLE qa_payment_simulations (
 id VARCHAR(80) NOT NULL PRIMARY KEY,
 agency_id INT NOT NULL,
 payer_user_id INT NOT NULL,
 client_id INT NULL,
 source_kind VARCHAR(40) NOT NULL,
 source_id VARCHAR(128) NOT NULL,
 amount_cents BIGINT NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'usd',
 status VARCHAR(40) NOT NULL DEFAULT 'requires_confirmation',
 scenario VARCHAR(24) NOT NULL DEFAULT 'success',
 idempotency_key VARCHAR(191) NOT NULL,
 metadata_json JSON NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_qa_payment_request (agency_id,idempotency_key),
 KEY idx_qa_payment_owner (agency_id,payer_user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE guardian_payment_cards MODIFY COLUMN payment_provider ENUM('QUICKBOOKS_PAYMENTS','STRIPE','QA_SIMULATOR') NOT NULL DEFAULT 'QUICKBOOKS_PAYMENTS';
ALTER TABLE family_ledger_payments MODIFY COLUMN processor ENUM('STRIPE','CASH','LEGACY','QA_SIMULATOR') NOT NULL;
