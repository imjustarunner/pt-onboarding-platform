-- Summit Stats fallback workflow: claimable roster placeholders and manager on-behalf uploads.

ALTER TABLE users
  ADD COLUMN is_roster_placeholder TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Imported roster shell account; claimed when the athlete signs up',
  ADD COLUMN roster_placeholder_claim_email VARCHAR(255) NULL
    COMMENT 'Normalized real email used to claim this placeholder account',
  ADD COLUMN roster_placeholder_claimed_at DATETIME NULL,
  ADD INDEX idx_users_roster_placeholder_claim_email (roster_placeholder_claim_email);

ALTER TABLE challenge_workouts
  ADD COLUMN submitted_by_user_id INT NULL
    COMMENT 'Manager/user who created this row; null means self-submitted legacy row'
    AFTER user_id,
  ADD COLUMN submitted_on_behalf_of_user_id INT NULL
    COMMENT 'Athlete represented by a manager-created workout'
    AFTER submitted_by_user_id,
  ADD COLUMN submission_source VARCHAR(64) NOT NULL DEFAULT 'self'
    COMMENT 'self, strava, manager_bulk_upload, etc.'
    AFTER submitted_on_behalf_of_user_id,
  ADD COLUMN ocr_confidence TINYINT UNSIGNED NULL
    AFTER submission_source,
  ADD COLUMN ocr_raw_text MEDIUMTEXT NULL
    AFTER ocr_confidence,
  ADD COLUMN ocr_extracted_json JSON NULL
    AFTER ocr_raw_text,
  ADD INDEX idx_challenge_workouts_submitted_by (submitted_by_user_id),
  ADD INDEX idx_challenge_workouts_on_behalf (submitted_on_behalf_of_user_id),
  ADD CONSTRAINT fk_challenge_workouts_submitted_by
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_challenge_workouts_on_behalf
    FOREIGN KEY (submitted_on_behalf_of_user_id) REFERENCES users(id) ON DELETE SET NULL;
