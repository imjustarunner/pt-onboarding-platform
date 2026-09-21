-- App-owned notifications, independent of Google accounts/calendar invitations.
ALTER TABLE provider_schedule_events ADD COLUMN reminder_minutes INT NULL DEFAULT 5;
ALTER TABLE supervision_sessions ADD COLUMN reminder_minutes INT NULL DEFAULT 5;
ALTER TABLE supervision_sessions ADD COLUMN event_timezone VARCHAR(64) NULL;

CREATE TABLE meeting_email_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  event_id INT NOT NULL,
  meeting_type VARCHAR(24) NOT NULL DEFAULT 'team_meeting',
  user_id INT NOT NULL,
  invitation_key VARCHAR(160) NOT NULL,
  join_token VARCHAR(64) NOT NULL,
  delivery_status VARCHAR(16) NOT NULL DEFAULT 'none',
  ready_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_meeting_invitation_recipient (invitation_key, user_id),
  UNIQUE KEY uq_meeting_invitation_token (join_token),
  KEY ix_meeting_invitation_due (delivery_status, ready_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
