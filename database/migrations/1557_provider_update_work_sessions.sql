-- Deployment prerequisite: no time tracking writes until this migration is applied.
ALTER TABLE provider_update_recipients ADD COLUMN activity_session_id CHAR(36) NULL;
CREATE TABLE provider_update_work_sessions (
  recipient_id INT NOT NULL,
  session_id CHAR(36) NOT NULL,
  last_sequence INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  active_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  section_seconds_json JSON NOT NULL,
  PRIMARY KEY (recipient_id, session_id)
);
CREATE TABLE provider_update_help_requests (
  recipient_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  ticket_id INT NOT NULL,
  PRIMARY KEY (recipient_id, request_id)
);
