/*
Learning program billing foundation (additive only).

This migration introduces:
- Learning service catalog
- Session linkage to booked office events
- Charge + payment scaffolding
- Subscription + token ledger scaffolding
- QuickBooks outbound sync queue scaffolding

No existing billing, scheduling, or receivables tables are modified.
*/

CREATE TABLE IF NOT EXISTS learning_services (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NULL,
  service_type ENUM('TUTORING','HOMEWORK_HELP','GROUP_TUTORING','OTHER') NOT NULL DEFAULT 'TUTORING',
  default_fee_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_services_agency_code (agency_id, code),
  KEY idx_learning_services_agency_active (agency_id, is_active),
  CONSTRAINT fk_learning_services_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_services_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_billing_accounts (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  require_card_on_file TINYINT(1) NOT NULL DEFAULT 1,
  allow_pay_per_event TINYINT(1) NOT NULL DEFAULT 1,
  allow_subscriptions TINYINT(1) NOT NULL DEFAULT 1,
  max_cancellations_per_month INT NOT NULL DEFAULT 2,
  settings_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_billing_accounts_agency (agency_id),
  CONSTRAINT fk_learning_billing_accounts_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_billing_accounts_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_program_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  organization_id INT NULL,
  office_event_id INT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NULL,
  assigned_provider_id INT NULL,
  learning_service_id INT NULL,
  is_group_session TINYINT(1) NOT NULL DEFAULT 0,
  capacity INT NOT NULL DEFAULT 1,
  seat_count INT NOT NULL DEFAULT 1,
  session_status ENUM('SCHEDULED','ATTENDED','CANCELLED','NO_SHOW','RESCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
  payment_mode ENUM('TOKEN','PAY_PER_EVENT','SUBSCRIPTION') NOT NULL DEFAULT 'PAY_PER_EVENT',
  scheduled_start_at DATETIME NOT NULL,
  scheduled_end_at DATETIME NOT NULL,
  source_timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  start_at_utc DATETIME NULL,
  end_at_utc DATETIME NULL,
  notes TEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_program_sessions_office_event (office_event_id),
  KEY idx_learning_program_sessions_agency_start (agency_id, scheduled_start_at),
  KEY idx_learning_program_sessions_client_start (client_id, scheduled_start_at),
  KEY idx_learning_program_sessions_provider_start (assigned_provider_id, scheduled_start_at),
  KEY idx_learning_program_sessions_status (session_status),
  CONSTRAINT fk_learning_program_sessions_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_program_sessions_org FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_program_sessions_office_event FOREIGN KEY (office_event_id) REFERENCES office_events(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_program_sessions_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_program_sessions_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_program_sessions_provider FOREIGN KEY (assigned_provider_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_program_sessions_service FOREIGN KEY (learning_service_id) REFERENCES learning_services(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_program_sessions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_session_charges (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  learning_program_session_id BIGINT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  tax_cents INT NOT NULL DEFAULT 0,
  discount_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  charge_status ENUM('PENDING','AUTHORIZED','CAPTURED','VOIDED','REFUNDED','FAILED') NOT NULL DEFAULT 'PENDING',
  charge_type ENUM('SESSION_FEE','GROUP_FEE','LATE_CANCEL_FEE','NO_SHOW_FEE','ADJUSTMENT') NOT NULL DEFAULT 'SESSION_FEE',
  due_at DATETIME NULL,
  captured_at DATETIME NULL,
  quickbooks_customer_ref VARCHAR(120) NULL,
  quickbooks_invoice_ref VARCHAR(120) NULL,
  quickbooks_payment_ref VARCHAR(120) NULL,
  idempotency_key VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_session_charges_idempotency (idempotency_key),
  KEY idx_learning_session_charges_session (learning_program_session_id),
  KEY idx_learning_session_charges_client (client_id, created_at),
  KEY idx_learning_session_charges_status (charge_status, due_at),
  CONSTRAINT fk_learning_session_charges_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_session_charges_session FOREIGN KEY (learning_program_session_id) REFERENCES learning_program_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_session_charges_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_session_charges_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_session_charges_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_payment_methods (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  owner_user_id INT NOT NULL,
  owner_client_id INT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'UNSET',
  provider_customer_id VARCHAR(120) NULL,
  provider_payment_method_id VARCHAR(120) NULL,
  card_brand VARCHAR(40) NULL,
  last4 VARCHAR(4) NULL,
  exp_month TINYINT NULL,
  exp_year SMALLINT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  billing_address_json JSON NULL,
  token_encrypted TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_payment_methods_owner (owner_user_id, is_active),
  KEY idx_learning_payment_methods_client (owner_client_id, is_active),
  CONSTRAINT fk_learning_payment_methods_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_payment_methods_owner_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_payment_methods_owner_client FOREIGN KEY (owner_client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_payments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  learning_session_charge_id BIGINT NULL,
  payment_method_id BIGINT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  payment_status ENUM('REQUIRES_ACTION','AUTHORIZED','CAPTURED','VOIDED','REFUNDED','FAILED') NOT NULL DEFAULT 'REQUIRES_ACTION',
  processor VARCHAR(40) NOT NULL DEFAULT 'UNSET',
  processor_intent_id VARCHAR(128) NULL,
  processor_charge_id VARCHAR(128) NULL,
  captured_at DATETIME NULL,
  failed_at DATETIME NULL,
  failure_reason VARCHAR(255) NULL,
  idempotency_key VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_payments_idempotency (idempotency_key),
  KEY idx_learning_payments_charge (learning_session_charge_id),
  KEY idx_learning_payments_status (payment_status, created_at),
  CONSTRAINT fk_learning_payments_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_payments_charge FOREIGN KEY (learning_session_charge_id) REFERENCES learning_session_charges(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_payments_method FOREIGN KEY (payment_method_id) REFERENCES learning_payment_methods(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_payments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_payment_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payment_id BIGINT NOT NULL,
  attempt_no INT NOT NULL,
  request_payload_json JSON NULL,
  response_payload_json JSON NULL,
  result_status ENUM('SUCCESS','FAILED','PENDING') NOT NULL DEFAULT 'PENDING',
  error_message VARCHAR(255) NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_payment_attempts_payment_no (payment_id, attempt_no),
  KEY idx_learning_payment_attempts_result (result_status, attempted_at),
  CONSTRAINT fk_learning_payment_attempts_payment FOREIGN KEY (payment_id) REFERENCES learning_payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_subscription_plans (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  plan_type ENUM('INDIVIDUAL','GROUP','HYBRID') NOT NULL DEFAULT 'INDIVIDUAL',
  monthly_fee_cents INT NOT NULL DEFAULT 0,
  included_individual_tokens INT NOT NULL DEFAULT 0,
  included_group_tokens INT NOT NULL DEFAULT 0,
  cancellation_limit_per_month INT NOT NULL DEFAULT 2,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_subscription_plans_agency_active (agency_id, is_active),
  CONSTRAINT fk_learning_subscription_plans_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_subscription_plans_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_subscriptions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  plan_id BIGINT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NULL,
  status ENUM('ACTIVE','PAUSED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  current_period_start DATETIME NOT NULL,
  current_period_end DATETIME NOT NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 1,
  processor_subscription_id VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_subscriptions_client_status (client_id, status),
  KEY idx_learning_subscriptions_period (current_period_start, current_period_end),
  CONSTRAINT fk_learning_subscriptions_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES learning_subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_subscriptions_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_subscriptions_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_subscriptions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_token_ledgers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NULL,
  subscription_id BIGINT NULL,
  learning_program_session_id BIGINT NULL,
  token_type ENUM('INDIVIDUAL','GROUP') NOT NULL DEFAULT 'INDIVIDUAL',
  direction ENUM('CREDIT','DEBIT') NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reason_code VARCHAR(64) NOT NULL,
  effective_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_token_ledgers_client_effective (client_id, effective_at),
  KEY idx_learning_token_ledgers_sub (subscription_id, effective_at),
  KEY idx_learning_token_ledgers_session (learning_program_session_id),
  CONSTRAINT fk_learning_token_ledgers_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_token_ledgers_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_token_ledgers_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_token_ledgers_sub FOREIGN KEY (subscription_id) REFERENCES learning_subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_token_ledgers_session FOREIGN KEY (learning_program_session_id) REFERENCES learning_program_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_token_ledgers_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quickbooks_sync_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  entity_type ENUM('LEARNING_CHARGE','LEARNING_PAYMENT','LEARNING_REFUND') NOT NULL,
  entity_id BIGINT NOT NULL,
  operation ENUM('CREATE_INVOICE','CREATE_PAYMENT','CREATE_REFUND','VOID') NOT NULL,
  status ENUM('PENDING','PROCESSING','SUCCEEDED','FAILED','DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
  idempotency_key VARCHAR(128) NOT NULL,
  run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  last_error TEXT NULL,
  payload_json JSON NULL,
  locked_at DATETIME NULL,
  locked_by VARCHAR(96) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quickbooks_sync_jobs_idempotency (idempotency_key),
  KEY idx_quickbooks_sync_jobs_pick (status, run_after, attempts),
  KEY idx_quickbooks_sync_jobs_entity (entity_type, entity_id),
  CONSTRAINT fk_quickbooks_sync_jobs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quickbooks_sync_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  job_id BIGINT NOT NULL,
  status ENUM('PENDING','PROCESSING','SUCCEEDED','FAILED') NOT NULL,
  request_json JSON NULL,
  response_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quickbooks_sync_events_job (job_id, created_at),
  CONSTRAINT fk_quickbooks_sync_events_job FOREIGN KEY (job_id) REFERENCES quickbooks_sync_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
