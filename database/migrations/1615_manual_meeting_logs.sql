-- Historical fallback records: no calendar invitations, reminders, or automatic approval.
CREATE TABLE IF NOT EXISTS manual_meeting_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  event_id INT NOT NULL,
  submitted_by_user_id INT NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_manual_meeting_request (agency_id, submitted_by_user_id, request_id),
  UNIQUE KEY uq_manual_meeting_event (event_id),
  CONSTRAINT fk_manual_meeting_event FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
);
CREATE TABLE IF NOT EXISTS manual_meeting_log_attendees (
  log_id INT NOT NULL,
  user_id INT NOT NULL,
  minutes DECIMAL(8,2) NOT NULL,
  claim_policy VARCHAR(32) NOT NULL,
  covered_claim_id INT NULL,
  reviewed_by_user_id INT NULL,
  review_note VARCHAR(500) NULL,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (log_id, user_id),
  CONSTRAINT fk_manual_meeting_attendee_log FOREIGN KEY (log_id) REFERENCES manual_meeting_logs(id)
);
