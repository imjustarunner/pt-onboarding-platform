CREATE TABLE agency_eligibility_automation (
 agency_id INT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 cadence ENUM('monthly','weekly','before_visit') NOT NULL DEFAULT 'monthly',
 monthly_limit INT UNSIGNED NOT NULL DEFAULT 0,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 reviewer_user_id INT NOT NULL,
 readiness_reference VARCHAR(1000) NOT NULL,
 scan_after_client_id INT NOT NULL DEFAULT 0,
 last_run_at DATETIME NULL,
 last_run_status VARCHAR(64) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE client_eligibility_automation (
 agency_id INT NOT NULL, client_id INT NOT NULL,
 billing_office_location_id INT NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 last_checked_at DATETIME NULL,
 last_status VARCHAR(64) NULL,
 updated_by_user_id INT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id,client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Locks serialize shared-account quota reservations across tenants and replicas.
CREATE TABLE claimmd_eligibility_usage_locks (
 connection_id VARCHAR(128) NOT NULL,
 usage_month CHAR(7) NOT NULL,
 PRIMARY KEY (connection_id,usage_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE claimmd_eligibility_usage (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 connection_id VARCHAR(128) NOT NULL,
 usage_month CHAR(7) NOT NULL,
 agency_id INT NOT NULL, client_id INT NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 source ENUM('manual','automatic') NOT NULL,
 status ENUM('reserved','returned','not_sent','unknown') NOT NULL DEFAULT 'reserved',
 coverage_check_id BIGINT UNSIGNED NULL,
 created_by_user_id INT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 UNIQUE KEY uq_eligibility_usage_request (agency_id,client_id,request_key),
 INDEX idx_eligibility_account_month (connection_id,usage_month,status),
 INDEX idx_eligibility_agency_month (agency_id,usage_month,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
