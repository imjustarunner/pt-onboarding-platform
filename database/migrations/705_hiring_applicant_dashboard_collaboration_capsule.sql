-- Hiring: per-viewer "new" applicants, note threading/reactions, interview schedule,
-- candidate reviews, interview feedback + time capsule entries + email tracking.

CREATE TABLE IF NOT EXISTS hiring_candidate_views (
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  viewer_user_id INT NOT NULL,
  first_viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, candidate_user_id, viewer_user_id),
  INDEX idx_hiring_candidate_views_viewer (viewer_user_id, agency_id),
  CONSTRAINT fk_hcv_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hcv_viewer FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE hiring_notes
  ADD COLUMN parent_note_id INT NULL,
  ADD INDEX idx_hiring_notes_parent (parent_note_id),
  ADD CONSTRAINT fk_hiring_notes_parent FOREIGN KEY (parent_note_id) REFERENCES hiring_notes(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS hiring_note_kudos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_note_kudos (note_id, user_id),
  INDEX idx_hiring_note_kudos_note (note_id),
  CONSTRAINT fk_hnk_note FOREIGN KEY (note_id) REFERENCES hiring_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_hnk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_note_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_note_reaction (note_id, user_id, emoji),
  INDEX idx_hiring_note_reactions_note (note_id),
  CONSTRAINT fk_hnr_note FOREIGN KEY (note_id) REFERENCES hiring_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_hnr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE hiring_profiles
  ADD COLUMN interview_starts_at DATETIME NULL,
  ADD COLUMN interview_timezone VARCHAR(64) NULL,
  ADD COLUMN interview_status VARCHAR(24) NULL,
  ADD COLUMN interview_interviewer_user_ids JSON NULL,
  ADD COLUMN interview_scheduled_by_user_id INT NULL,
  ADD COLUMN interview_updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_hiring_profiles_interview_starts (interview_starts_at);

CREATE TABLE IF NOT EXISTS hiring_candidate_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  author_user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hcr_candidate (candidate_user_id),
  INDEX idx_hcr_agency (agency_id),
  INDEX idx_hcr_author (author_user_id),
  CONSTRAINT fk_hcr_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hcr_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_interview_splash_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hiring_profile_id INT NOT NULL,
  interviewer_user_id INT NOT NULL,
  attendance ENUM('pending', 'attended', 'did_not_attend') NOT NULL DEFAULT 'pending',
  impression MEDIUMTEXT NULL,
  rating TINYINT NULL,
  prediction_6m MEDIUMTEXT NULL,
  prediction_12m MEDIUMTEXT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_interview_splash (hiring_profile_id, interviewer_user_id),
  INDEX idx_hiss_interviewer_pending (interviewer_user_id, completed_at),
  CONSTRAINT fk_hiss_profile FOREIGN KEY (hiring_profile_id) REFERENCES hiring_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_hiss_user FOREIGN KEY (interviewer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS time_capsule_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_type VARCHAR(64) NOT NULL,
  subject_id INT NOT NULL,
  author_user_id INT NOT NULL,
  horizon_months SMALLINT NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  anchor_at DATETIME NOT NULL,
  reveal_at DATETIME NOT NULL,
  email_sent_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_time_capsule_reveal (reveal_at, email_sent_at),
  INDEX idx_time_capsule_subject (subject_type, subject_id),
  CONSTRAINT fk_tce_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'time_capsule_reveal',
    'Interview time capsule reveal',
    'Sends each interviewer only their own sealed 6- or 12-month hiring prediction after the reveal date.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', FALSE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', TRUE)
  );
