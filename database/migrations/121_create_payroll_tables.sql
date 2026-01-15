-- Migration: Create payroll tracking tables
-- Description: Import service-code volumes by pay period, apply per-user rates, compute totals, and track ADP exports.

CREATE TABLE IF NOT EXISTS payroll_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    label VARCHAR(100) NOT NULL COMMENT 'e.g., 2026-01-01 to 2026-01-15',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('draft','finalized') DEFAULT 'draft',
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY uniq_agency_period (agency_id, period_start, period_end),
    INDEX idx_payroll_period_agency (agency_id),
    INDEX idx_payroll_period_dates (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    user_id INT NOT NULL,
    service_code VARCHAR(64) NOT NULL,
    rate_amount DECIMAL(10,2) NOT NULL,
    rate_unit ENUM('per_unit','flat') DEFAULT 'per_unit',
    effective_start DATE NULL,
    effective_end DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_rate (agency_id, user_id, service_code, effective_start),
    INDEX idx_rate_lookup (agency_id, user_id, service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_imports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    payroll_period_id INT NOT NULL,
    source VARCHAR(32) DEFAULT 'csv',
    original_filename VARCHAR(255) NULL,
    uploaded_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_import_period (payroll_period_id),
    INDEX idx_import_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_import_rows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_import_id INT NOT NULL,
    payroll_period_id INT NOT NULL,
    agency_id INT NOT NULL,
    user_id INT NULL,
    provider_name VARCHAR(255) NOT NULL,
    service_code VARCHAR(64) NOT NULL,
    unit_count DECIMAL(10,2) NOT NULL DEFAULT 0,
    raw_row JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_import_id) REFERENCES payroll_imports(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_rows_period (payroll_period_id),
    INDEX idx_rows_user (user_id),
    INDEX idx_rows_service_code (service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_period_id INT NOT NULL,
    agency_id INT NOT NULL,
    user_id INT NOT NULL,
    total_units DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    adjustments_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    breakdown JSON NULL COMMENT 'Per service_code totals',
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_summary (payroll_period_id, user_id),
    INDEX idx_summary_period (payroll_period_id),
    INDEX idx_summary_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_adp_export_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_period_id INT NOT NULL,
    agency_id INT NOT NULL,
    requested_by_user_id INT NOT NULL,
    status ENUM('queued','sent','failed') DEFAULT 'queued',
    provider VARCHAR(32) DEFAULT 'adp',
    request_payload JSON NULL,
    response_payload JSON NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_adp_period (payroll_period_id),
    INDEX idx_adp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

