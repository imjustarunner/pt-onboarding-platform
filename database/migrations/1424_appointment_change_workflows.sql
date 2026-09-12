-- Durable drafts and signed, nonbillable appointment-change documentation.
CREATE TABLE IF NOT EXISTS appointment_change_workflows (
  appointment_id INT UNSIGNED NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  facts_json JSON NOT NULL,
  preview_json JSON NULL,
  result_json JSON NULL,
  narrative LONGTEXT NULL,
  signed_by_user_id INT NULL,
  signed_at DATETIME NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_appointment_change_agency_status (agency_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
