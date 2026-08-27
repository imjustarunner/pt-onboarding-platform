-- Migration 1322: Unified Package Engine foundation
-- Extends booking_packages for tenant-wide vs program-scoped catalogs,
-- billing/policy/domain JSON, public visibility, Stripe refs, payments audit.

ALTER TABLE booking_packages
  ADD COLUMN learning_program_class_id INT NULL
    COMMENT 'NULL = tenant-wide (coaching default / individual tutoring); set for program packages'
    AFTER business_type;

ALTER TABLE booking_packages
  ADD COLUMN package_type ENUM(
      'prepaid_bundle',
      'payg',
      'subscription',
      'installment',
      'retainer',
      'consulting_project'
    ) NOT NULL DEFAULT 'prepaid_bundle'
    COMMENT 'v1 ships prepaid_bundle + payg; others forward-compat'
    AFTER description;

ALTER TABLE booking_packages
  ADD COLUMN billing_options_json JSON NULL
    COMMENT 'e.g. { modes: [pay_in_full], installments, subscriptionInterval }'
    AFTER price_cents;

ALTER TABLE booking_packages
  ADD COLUMN policies_json JSON NULL
    COMMENT 'cancellation, no-show, expiration, rollover defaults'
    AFTER billing_options_json;

ALTER TABLE booking_packages
  ADD COLUMN domain_config_json JSON NULL
    COMMENT 'tutoring/coaching domain knobs (sessionMinutes, deliveryMode, autoEnrollSubject, etc.)'
    AFTER policies_json;

ALTER TABLE booking_packages
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = visible in guardian/public catalog'
    AFTER is_active;

ALTER TABLE booking_packages
  ADD COLUMN stripe_product_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    AFTER is_public;

ALTER TABLE booking_packages
  ADD COLUMN stripe_price_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    AFTER stripe_product_id;

ALTER TABLE booking_packages
  ADD KEY idx_booking_packages_program (agency_id, learning_program_class_id, is_active);

ALTER TABLE booking_packages
  ADD CONSTRAINT fk_booking_packages_program
    FOREIGN KEY (learning_program_class_id) REFERENCES learning_program_classes(id)
    ON DELETE SET NULL;

-- Allow pending entitlements before Stripe payment completes
ALTER TABLE booking_package_entitlements
  MODIFY COLUMN status ENUM('PENDING','ACTIVE','EXHAUSTED','CANCELLED') NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING until paid; ACTIVE when credited';

ALTER TABLE booking_package_entitlements
  ADD COLUMN learning_program_class_id INT NULL
    COMMENT 'Copied from package at purchase for reporting'
    AFTER package_id;

ALTER TABLE booking_package_entitlements
  ADD COLUMN purchaser_user_id INT NULL
    COMMENT 'Guardian/payer user id when purchased online'
    AFTER created_by_user_id;

ALTER TABLE booking_package_entitlements
  ADD COLUMN stripe_checkout_session_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    AFTER purchaser_user_id;

ALTER TABLE booking_package_entitlements
  ADD COLUMN stripe_payment_intent_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    AFTER stripe_checkout_session_id;

ALTER TABLE booking_package_entitlements
  ADD KEY idx_bpe_program (agency_id, learning_program_class_id);

ALTER TABLE booking_package_entitlements
  ADD KEY idx_bpe_intent (stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS booking_package_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  entitlement_id INT UNSIGNED NULL,
  package_id INT UNSIGNED NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'usd'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  payment_mode VARCHAR(32) NULL
    COMMENT 'PAY_IN_FULL, MANUAL, OFFLINE, etc.'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  payment_status ENUM('PENDING','SUCCEEDED','FAILED','REFUNDED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  processor VARCHAR(40) NOT NULL DEFAULT 'STRIPE'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  processor_intent_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  processor_charge_id VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  paid_at DATETIME NULL,
  metadata_json JSON NULL,
  idempotency_key VARCHAR(128) NULL
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bpp_idempotency (idempotency_key),
  KEY idx_bpp_client (agency_id, client_id, created_at),
  KEY idx_bpp_entitlement (entitlement_id),
  KEY idx_bpp_package (package_id),
  KEY idx_bpp_intent (processor_intent_id),
  CONSTRAINT fk_bpp_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpp_package
    FOREIGN KEY (package_id) REFERENCES booking_packages(id) ON DELETE SET NULL,
  CONSTRAINT fk_bpp_entitlement
    FOREIGN KEY (entitlement_id) REFERENCES booking_package_entitlements(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
