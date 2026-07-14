-- Migration 912: link coaching sessions ↔ packages ↔ payments
-- Session index (N of M), durable payment records, and calendar event linkage.
-- Note: MySQL may reject multi-column ADD in one statement on some versions — one column per ALTER.

ALTER TABLE provider_schedule_events
  ADD COLUMN client_id INT NULL
    COMMENT 'Client for discovery/coaching sessions'
    AFTER provider_id;

ALTER TABLE provider_schedule_events
  ADD COLUMN entitlement_id INT UNSIGNED NULL
    COMMENT 'practitioner_client_package_entitlements.id covering this session'
    AFTER client_id;

ALTER TABLE provider_schedule_events
  ADD COLUMN package_payment_id BIGINT UNSIGNED NULL
    COMMENT 'practitioner_package_payments.id that covers this session (if any)'
    AFTER entitlement_id;

ALTER TABLE provider_schedule_events
  ADD COLUMN session_index INT NULL
    COMMENT '1-based session number within the entitlement package'
    AFTER package_payment_id;

ALTER TABLE practitioner_session_credit_ledger
  ADD COLUMN entitlement_id INT UNSIGNED NULL
    COMMENT 'Entitlement this credit/debit applies to'
    AFTER packet_id;

ALTER TABLE practitioner_session_credit_ledger
  ADD COLUMN package_payment_id BIGINT UNSIGNED NULL
    COMMENT 'Payment that funded or covers this ledger row'
    AFTER entitlement_id;

CREATE TABLE IF NOT EXISTS practitioner_package_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  entitlement_id INT UNSIGNED NULL,
  packet_id INT UNSIGNED NULL,
  package_id INT UNSIGNED NULL,
  ledger_id BIGINT UNSIGNED NULL
    COMMENT 'Optional link to CREDIT/DEBIT ledger row',
  provider_schedule_event_id INT NULL
    COMMENT 'Optional per-session charge attachment',
  amount_cents INT NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'usd',
  payment_mode VARCHAR(32) NULL
    COMMENT 'PAY_IN_FULL, INSTALLMENTS, PER_SESSION, REUP, etc.',
  installment_index INT NULL
    COMMENT '1-based installment number when payment_mode=INSTALLMENTS',
  sessions_covered INT NULL
    COMMENT 'How many session credits this payment covers (NULL = whole package)',
  payment_status ENUM('PENDING','SUCCEEDED','FAILED','REFUNDED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  processor VARCHAR(40) NOT NULL DEFAULT 'STRIPE',
  processor_intent_id VARCHAR(128) NULL,
  processor_charge_id VARCHAR(128) NULL,
  chosen_at DATETIME NULL
    COMMENT 'When client selected package / payment mode',
  signed_at DATETIME NULL
    COMMENT 'When packet docs / account completed (if known)',
  paid_at DATETIME NULL,
  metadata_json JSON NULL,
  idempotency_key VARCHAR(128) NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ppp_idempotency (idempotency_key),
  KEY idx_ppp_client (agency_id, client_id, created_at),
  KEY idx_ppp_entitlement (entitlement_id),
  KEY idx_ppp_event (provider_schedule_event_id),
  KEY idx_ppp_intent (processor_intent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
