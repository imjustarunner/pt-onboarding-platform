ALTER TABLE hiring_reference_requests
  ADD COLUMN link_opened_at DATETIME NULL,
  ADD COLUMN reminder_48h_sent_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS hiring_reference_contacts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hiring_profile_id INT NOT NULL,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  reference_index INT NOT NULL,
  contact_method VARCHAR(24) NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  note TEXT NULL,
  responses_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reference_contacts (agency_id, hiring_profile_id, reference_index),
  CONSTRAINT fk_hrc_profile FOREIGN KEY (hiring_profile_id) REFERENCES hiring_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrc_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrc_author FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
