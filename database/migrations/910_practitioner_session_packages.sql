-- Migration 910: practitioner session packages (Phase 4)
-- Catalog + per-client offered subset + session credit ledger + missed/pay policies.

CREATE TABLE IF NOT EXISTS practitioner_session_packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  session_count INT NOT NULL DEFAULT 1
    COMMENT 'Sessions credited when package is activated',
  price_cents INT NOT NULL DEFAULT 0
    COMMENT 'List / base price in cents',
  -- Payment settings (each package owns its own)
  payment_mode_default ENUM('PAY_IN_FULL','INSTALLMENTS','PER_SESSION') NOT NULL DEFAULT 'PAY_IN_FULL',
  pay_in_full_price_cents INT NULL
    COMMENT 'Optional all-at-once total (discount vs price_cents)',
  pay_in_full_discount_cents INT NULL
    COMMENT 'Optional explicit discount amount when paying in full',
  installment_plan_json JSON NULL
    COMMENT 'e.g. { chunks: 4, intervalDays: 30, amountsCents: [..] } or equal splits',
  per_session_price_cents INT NULL
    COMMENT 'When payment_mode includes PER_SESSION',
  allowed_payment_modes_json JSON NULL
    COMMENT 'Subset of PAY_IN_FULL, INSTALLMENTS, PER_SESSION offered for this package',
  -- Missed / no-show / rebooking policy (per package)
  missed_session_policy_json JSON NULL
    COMMENT 'e.g. { type: fee|free_rebook|forfeit|custom, freeRebooks: 1, feeCents: 5000, note: \"...\" }',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_psp_agency_active (agency_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post-discovery packet: coach offers a subset of catalog packages (+ docs later)
CREATE TABLE IF NOT EXISTS practitioner_client_packets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  access_token VARCHAR(64) NOT NULL,
  token_expires_at DATETIME NULL,
  status ENUM('DRAFT','SENT','IN_PROGRESS','COMPLETED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  offered_package_ids_json JSON NOT NULL
    COMMENT 'Subset of practitioner_session_packages.id offered to this client',
  selected_package_id INT UNSIGNED NULL,
  selected_payment_mode VARCHAR(32) NULL,
  intake_link_ids_json JSON NULL
    COMMENT 'Optional docs/intake links included in packet',
  notes TEXT NULL,
  sent_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pcp_token (access_token),
  KEY idx_pcp_agency_client (agency_id, client_id),
  KEY idx_pcp_status (agency_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session balance ledger (CREDIT on purchase, DEBIT on completed session)
CREATE TABLE IF NOT EXISTS practitioner_session_credit_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  package_id INT UNSIGNED NULL,
  packet_id INT UNSIGNED NULL,
  provider_schedule_event_id INT NULL,
  direction ENUM('CREDIT','DEBIT') NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  reason_code VARCHAR(64) NOT NULL
    COMMENT 'PACKAGE_PURCHASE, SESSION_COMPLETED, MISSED_FORFEIT, FREE_REBOOK, MANUAL_ADJUST, etc.',
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pscl_client_balance (agency_id, client_id, created_at),
  KEY idx_pscl_event (provider_schedule_event_id),
  KEY idx_pscl_packet (packet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Active entitlement snapshot (optional denorm for quick remaining count)
CREATE TABLE IF NOT EXISTS practitioner_client_package_entitlements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  package_id INT UNSIGNED NOT NULL,
  packet_id INT UNSIGNED NULL,
  sessions_purchased INT NOT NULL DEFAULT 0,
  sessions_remaining INT NOT NULL DEFAULT 0,
  free_rebooks_remaining INT NOT NULL DEFAULT 0,
  payment_mode VARCHAR(32) NULL,
  payment_status ENUM('PENDING','PARTIAL','PAID','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  installment_state_json JSON NULL
    COMMENT 'Tracks which installments paid / due dates',
  status ENUM('ACTIVE','EXHAUSTED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  activated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pcpe_client (agency_id, client_id, status),
  KEY idx_pcpe_package (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
