-- Summit Stats Challenge: manager verification flow for record-breaking workouts

CREATE TABLE IF NOT EXISTS summit_stats_club_record_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  record_id VARCHAR(128) NOT NULL,
  record_label VARCHAR(255) NOT NULL,
  metric_key VARCHAR(64) NOT NULL,
  current_value DECIMAL(12,3) NOT NULL,
  candidate_value DECIMAL(12,3) NOT NULL,
  workout_id INT NOT NULL,
  challenger_user_id INT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL,
  review_note TEXT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ssc_record_verifications_agency_status (agency_id, status),
  INDEX idx_ssc_record_verifications_workout (workout_id),
  CONSTRAINT fk_ssc_record_verifications_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssc_record_verifications_workout
    FOREIGN KEY (workout_id) REFERENCES challenge_workouts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssc_record_verifications_challenger
    FOREIGN KEY (challenger_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssc_record_verifications_reviewer
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
