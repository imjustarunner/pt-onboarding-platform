-- Migration: PTO accounts, ledger, and requests
-- Description: Track PTO balances (Sick + Training), accrual, and requests with approval workflow.

CREATE TABLE IF NOT EXISTS payroll_pto_accounts (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,

  employment_type ENUM('hourly','fee_for_service','salaried') NOT NULL DEFAULT 'hourly',
  training_pto_eligible TINYINT(1) NOT NULL DEFAULT 0,

  sick_start_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  sick_start_effective_date DATE NULL,

  training_start_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  training_start_effective_date DATE NULL,

  sick_balance_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  training_balance_hours DECIMAL(12,2) NOT NULL DEFAULT 0,

  last_accrued_payroll_period_id INT NULL,
  last_sick_rollover_year INT NULL,
  training_forfeited_at DATETIME NULL,

  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (agency_id, user_id),
  INDEX idx_pto_accounts_user (user_id),
  INDEX idx_pto_accounts_agency (agency_id),
  CONSTRAINT fk_pto_accounts_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_accounts_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_accounts_last_accrued_period FOREIGN KEY (last_accrued_payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  CONSTRAINT fk_pto_accounts_updated_by_user_id FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS payroll_pto_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,

  entry_type ENUM('starting_balance','accrual','usage','manual_adjustment','forfeit') NOT NULL,
  pto_bucket ENUM('sick','training') NOT NULL,
  hours_delta DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,

  payroll_period_id INT NULL,
  request_id INT NULL,

  note VARCHAR(255) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_pto_ledger_user_date (agency_id, user_id, effective_date),
  INDEX idx_pto_ledger_period (agency_id, payroll_period_id),
  INDEX idx_pto_ledger_request (request_id),

  CONSTRAINT fk_pto_ledger_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_ledger_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_ledger_period_id FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  CONSTRAINT fk_pto_ledger_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS payroll_pto_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected|deferred|paid
  request_type ENUM('sick','training') NOT NULL,

  notes TEXT NULL,
  training_description TEXT NULL,

  -- Optional proof upload (training PTO)
  proof_file_path VARCHAR(512) NULL,
  proof_original_name VARCHAR(255) NULL,
  proof_mime_type VARCHAR(128) NULL,
  proof_size_bytes INT NULL,

  -- Policy UI data: warnings + acknowledgements
  policy_warnings_json JSON NULL,
  policy_ack_json JSON NULL,

  -- Derived / bookkeeping
  total_hours DECIMAL(12,2) NOT NULL DEFAULT 0,

  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  rejected_by_user_id INT NULL,
  rejected_at DATETIME NULL,
  rejection_reason VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_pto_requests_agency_status (agency_id, status),
  INDEX idx_pto_requests_user (agency_id, user_id, created_at),

  CONSTRAINT fk_pto_requests_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_requests_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_requests_approved_by_user_id FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pto_requests_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS payroll_pto_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  agency_id INT NOT NULL,
  request_date DATE NOT NULL,
  hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_pto_request_items_request (request_id),
  INDEX idx_pto_request_items_agency_date (agency_id, request_date),

  CONSTRAINT fk_pto_request_items_request FOREIGN KEY (request_id) REFERENCES payroll_pto_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_pto_request_items_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

