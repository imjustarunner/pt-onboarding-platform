-- Scheduled staff training uses the app meeting/RSVP/attendance lifecycle, separate from courses.
CREATE TABLE IF NOT EXISTS scheduled_trainings (
  event_id INT NOT NULL PRIMARY KEY,
  series_key VARCHAR(64) NOT NULL,
  seed_key VARCHAR(100) NULL UNIQUE,
  topic TEXT NULL,
  agency_visible TINYINT(1) NOT NULL DEFAULT 0,
  video_default_on TINYINT(1) NOT NULL DEFAULT 0,
  video_allowed TINYINT(1) NOT NULL DEFAULT 1,
  mute_all TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (series_key)
);
CREATE TABLE IF NOT EXISTS scheduled_training_assets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (event_id)
);
CREATE TABLE IF NOT EXISTS scheduled_training_hands (
  event_id INT NOT NULL, user_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'raised',
  raised_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by_user_id INT NULL, resolved_at DATETIME NULL,
  PRIMARY KEY (event_id,user_id)
);
CREATE TABLE IF NOT EXISTS scheduled_training_logs (
  event_id INT NOT NULL, user_id INT NOT NULL, agency_id INT NOT NULL,
  attendance_seconds INT NOT NULL DEFAULT 0,
  credit_type VARCHAR(24) NOT NULL,
  is_required TINYINT(1) NOT NULL,
  payable TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,user_id), INDEX (agency_id,user_id)
);
ALTER TABLE video_meeting_activity ADD COLUMN recipient_user_id INT NULL,
  ADD INDEX idx_meeting_private_chat (event_id,recipient_user_id,user_id);
