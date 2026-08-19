-- Migration 1244: Fulfillment overlay for school/provider materials requests
-- Source requests stay on onboarding / reinit / provider-year-update JSON.
-- This table tracks assignment, check-off, and gear-inventory issuance.

CREATE TABLE materials_request_fulfillments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  source_type ENUM('school_onboarding', 'school_reinit', 'provider_year_update') NOT NULL,
  source_id INT NOT NULL,
  item_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status ENUM('pending', 'assigned', 'fulfilled') NOT NULL DEFAULT 'pending',
  assigned_to_user_id INT NULL DEFAULT NULL,
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  gear_assignment_id INT NULL DEFAULT NULL,
  unique_asset_id INT NULL DEFAULT NULL,
  gear_item_type_id INT NULL DEFAULT NULL,
  fulfilled_by_user_id INT NULL DEFAULT NULL,
  fulfilled_at DATETIME NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  extra_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mat_req_item (agency_id, source_type, source_id, item_key),
  INDEX idx_mat_req_agency_status (agency_id, status),
  INDEX idx_mat_req_assignee (assigned_to_user_id),
  CONSTRAINT fk_mat_req_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
