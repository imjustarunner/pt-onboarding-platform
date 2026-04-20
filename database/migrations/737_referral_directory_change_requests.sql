-- 737_referral_directory_change_requests.sql
-- Admin approval queue for non-admin create/update/delete proposals against
-- referral_directory_entries. See migration 736 for the catalog table and
-- backend/src/controllers/referralDirectory.controller.js for the apply logic.

CREATE TABLE IF NOT EXISTS referral_directory_change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  entry_id INT NULL,
  change_type ENUM('create','update','delete') NOT NULL,
  proposed_payload JSON NULL,
  submitted_by_user_id INT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  admin_notes VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES referral_directory_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_agency_status (agency_id, status),
  INDEX idx_entry (entry_id),
  INDEX idx_submitter (submitted_by_user_id),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
