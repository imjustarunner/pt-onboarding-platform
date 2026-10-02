CREATE TABLE meeting_summary_jobs (
  meeting_type ENUM('team','supervision') NOT NULL,
  meeting_id INT NOT NULL,
  status ENUM('queued','generating','ready','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  rerun_requested BOOLEAN NOT NULL DEFAULT FALSE,
  lease_token VARCHAR(64) NULL,
  lease_until DATETIME NULL,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_type,meeting_id),
  KEY idx_summary_jobs_pending (status,available_at)
);
CREATE TABLE meeting_personal_notes (
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  note_text LONGTEXT NULL,
  note_ciphertext LONGTEXT NULL,
  note_iv VARCHAR(64) NULL,
  note_auth_tag VARCHAR(64) NULL,
  encryption_key_id VARCHAR(64) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,user_id),
  FOREIGN KEY(event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
