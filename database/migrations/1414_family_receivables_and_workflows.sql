-- All amounts are integer minor currency units. This follows 1413.
CREATE TABLE family_receivables (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_key VARCHAR(100) NOT NULL,
  service_domain VARCHAR(40) NOT NULL,
  service_label VARCHAR(120) NOT NULL DEFAULT 'Services',
  service_date DATE NULL,
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  due_date DATE NOT NULL,
  status ENUM('review','open','paid','void') NOT NULL DEFAULT 'review',
  insurance_reviewed TINYINT NOT NULL DEFAULT 0,
  disputed_at DATETIME NULL,
  hold_reason VARCHAR(80) NULL,
  source_payload LONGTEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_receivable_source(agency_id,source_type,source_key),
  KEY ix_family_receivable_client(agency_id,client_id,status),
  KEY ix_family_receivable_due(agency_id,status,due_date),
  CHECK (amount_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_billing_rules (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  rule_kind ENUM('single','split','alternate') NOT NULL,
  shares_json JSON NOT NULL,
  next_sequence BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  evidence_encrypted LONGTEXT NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(agency_id,client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_receivable_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  receivable_id BIGINT NOT NULL,
  payer_user_id INT NULL,
  amount_cents INT NOT NULL,
  paid_cents INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_family_allocation_payer(receivable_id,payer_user_id),
  KEY ix_family_allocation_payer(agency_id,payer_user_id),
  FOREIGN KEY(receivable_id) REFERENCES family_receivables(id),
  CHECK(amount_cents >= 0 AND paid_cents >= 0 AND paid_cents <= amount_cents)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_statement_shares (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  evidence_encrypted LONGTEXT NOT NULL,
  granted_by_user_id INT NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY(agency_id,client_id,guardian_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_split_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  receivable_id BIGINT NOT NULL,
  requested_by_user_id INT NOT NULL,
  shares_json JSON NOT NULL,
  accepted_user_ids_json JSON NOT NULL,
  status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  evidence_encrypted LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY(receivable_id) REFERENCES family_receivables(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_ledger_payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  allocation_id BIGINT NOT NULL,
  payer_user_id INT NOT NULL,
  processor ENUM('STRIPE','CASH','LEGACY') NOT NULL,
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('pending','requires_action','succeeded','failed','cancelled','unknown') NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(160) NOT NULL,
  processor_intent_id VARCHAR(128) NULL,
  snapshot_encrypted LONGTEXT NOT NULL,
  receipt_number VARCHAR(80) NULL,
  receipt_encrypted LONGTEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at DATETIME NULL,
  UNIQUE KEY uq_family_payment_key(agency_id,idempotency_key),
  UNIQUE KEY uq_family_receipt(agency_id,receipt_number),
  KEY ix_family_payment_intent(processor_intent_id),
  FOREIGN KEY(allocation_id) REFERENCES family_receivable_allocations(id),
  CHECK(amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_payment_refunds (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payment_id BIGINT NOT NULL,
  amount_cents INT NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  status ENUM('pending','succeeded','failed','unknown') NOT NULL DEFAULT 'pending',
  processor_refund_id VARCHAR(128) NULL,
  reason_encrypted LONGTEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_family_refund_key(agency_id,idempotency_key),
  FOREIGN KEY(payment_id) REFERENCES family_ledger_payments(id),
  CHECK(amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_payment_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  allocation_id BIGINT NOT NULL,
  payer_user_id INT NOT NULL,
  status ENUM('proposed','active','cancelled','completed') NOT NULL DEFAULT 'proposed',
  amount_cents INT NOT NULL,
  paid_before_cents INT NOT NULL DEFAULT 0,
  auto_pay TINYINT NOT NULL DEFAULT 0,
  consent_encrypted LONGTEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME NULL,
  FOREIGN KEY(allocation_id) REFERENCES family_receivable_allocations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE family_plan_installments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  plan_id BIGINT NOT NULL,
  sequence_number INT NOT NULL,
  amount_cents INT NOT NULL,
  due_date DATE NOT NULL,
  UNIQUE KEY uq_family_plan_sequence(plan_id,sequence_number),
  FOREIGN KEY(plan_id) REFERENCES family_payment_plans(id),
  CHECK(amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_billing_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  client_ids_json JSON NOT NULL,
  title VARCHAR(160) NOT NULL DEFAULT 'Verify payment method and billing authorization',
  status ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  require_card TINYINT NOT NULL DEFAULT 1,
  terms_version VARCHAR(80) NOT NULL,
  waiver_encrypted LONGTEXT NOT NULL,
  signed_evidence_encrypted LONGTEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_family_task_token(token_hash),
  KEY ix_family_tasks(agency_id,guardian_user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collections_notices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payer_user_id INT NOT NULL,
  notice_kind ENUM('statement','reminder','past_due','payment_setup') NOT NULL,
  status ENUM('draft','queued','sent','held','failed','cancelled') NOT NULL DEFAULT 'draft',
  snapshot_encrypted LONGTEXT NOT NULL,
  token_encrypted LONGTEXT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  sender_identity_id INT NULL,
  email_message_id VARCHAR(255) NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  UNIQUE KEY uq_family_notice(agency_id,idempotency_key),
  KEY ix_family_notice_payer(agency_id,payer_user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_billing_sender_provisioning (
  agency_id INT NOT NULL,
  identity_key VARCHAR(40) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  state ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
  google_group_id VARCHAR(255) NULL,
  sender_identity_id INT NULL,
  last_error VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(agency_id,identity_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_fulfillment_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  receivable_id BIGINT NOT NULL,
  status ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_fulfillment(receivable_id),
  FOREIGN KEY(receivable_id) REFERENCES family_receivables(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
