-- Migration 980: Unified booking packages / entitlements / consumption ledger (Phase 2)
-- Cross-vertical session packages for counseling, tutoring, coaching, consulting, etc.
-- Practitioner packages (910) remain; this ledger is the shared booking consumption spine.

CREATE TABLE IF NOT EXISTS booking_packages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  business_type VARCHAR(64) NOT NULL
    COMMENT 'Must match an enabled agency_business_types row when booking',
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  session_count INT NOT NULL DEFAULT 1
    COMMENT 'Sessions credited when entitlement is activated',
  price_cents INT NOT NULL DEFAULT 0,
  allowed_tenant_service_ids_json JSON NULL
    COMMENT 'NULL = any package_eligible service of this business_type; else subset of tenant_services.id',
  consume_on ENUM('reserve', 'complete') NOT NULL DEFAULT 'reserve'
    COMMENT 'reserve = debit available on book; complete = debit when appointment completed',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_booking_packages_agency (agency_id, is_active, sort_order),
  KEY idx_booking_packages_type (agency_id, business_type),
  CONSTRAINT fk_booking_packages_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_package_entitlements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  package_id INT UNSIGNED NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  sessions_purchased INT NOT NULL DEFAULT 0,
  sessions_remaining INT NOT NULL DEFAULT 0
    COMMENT 'Available to book (not reserved/consumed)',
  sessions_reserved INT NOT NULL DEFAULT 0
    COMMENT 'Held by confirmed/upcoming appointments',
  payment_status ENUM('PENDING', 'PARTIAL', 'PAID', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  status ENUM('ACTIVE', 'EXHAUSTED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  practitioner_entitlement_id INT UNSIGNED NULL
    COMMENT 'Optional bridge to practitioner_client_package_entitlements.id',
  activated_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bpe_client (agency_id, client_id, status),
  KEY idx_bpe_package (package_id),
  CONSTRAINT fk_bpe_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpe_package
    FOREIGN KEY (package_id) REFERENCES booking_packages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_package_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  entitlement_id INT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  appointment_id INT UNSIGNED NULL,
  direction ENUM('CREDIT', 'RESERVE', 'RELEASE', 'CONSUME', 'ADJUST') NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reason_code VARCHAR(64) NOT NULL
    COMMENT 'PACKAGE_PURCHASE, BOOKING_RESERVE, BOOKING_RELEASE, SESSION_COMPLETE, MANUAL_ADJUST, …',
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bpl_entitlement (entitlement_id, created_at),
  KEY idx_bpl_appointment (appointment_id),
  KEY idx_bpl_client (agency_id, client_id, created_at),
  CONSTRAINT fk_bpl_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpl_entitlement
    FOREIGN KEY (entitlement_id) REFERENCES booking_package_entitlements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
