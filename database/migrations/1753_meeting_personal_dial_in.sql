-- Fresh-install compatibility only: existing recovered tables are retained unchanged.
-- One private credential per invited person and scheduled occurrence. No shared room PIN.
CREATE TABLE IF NOT EXISTS meeting_dial_in_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_type VARCHAR(24) NOT NULL,
  meeting_id INT NOT NULL,
  user_id INT NOT NULL,
  occurrence_key CHAR(64) NOT NULL,
  pin_hash CHAR(64) NOT NULL,
  pin_encrypted TEXT NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_dial_in_person (meeting_type, meeting_id, user_id, occurrence_key),
  UNIQUE KEY uq_dial_in_pin (pin_hash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS meeting_dial_in_calls (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invitation_id BIGINT UNSIGNED NULL,
  caller_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  admit_invited_callers TINYINT(1) NOT NULL DEFAULT 0,
  state VARCHAR(24) NOT NULL DEFAULT 'pin',
  bridge_hash CHAR(64) NULL,
  bridge_uuid VARCHAR(80) NULL,
  bridge_started_at DATETIME(3) NULL,
  bridge_answered_at DATETIME(3) NULL,
  video_session_id VARCHAR(512) NULL,
  video_connection_id VARCHAR(80) NULL,
  video_stream_id VARCHAR(80) NULL,
  audio_connection_id VARCHAR(80) NULL,
  audio_token_hash CHAR(64) NULL,
  audio_revision INT NULL,
  audio_connected_at DATETIME(3) NULL,
  audio_last_seen_at DATETIME(3) NULL,
  audio_status VARCHAR(32) NOT NULL DEFAULT 'off',
  connected_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  last_verified_at DATETIME(3) NULL,
  disconnected_at DATETIME(3) NULL,
  attendance_synced_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_dial_in_pending (state, updated_at),
  KEY ix_dial_in_attendance (invitation_id, connected_at),
  KEY ix_dial_in_abuse (caller_hash, created_at),
  CONSTRAINT fk_dial_in_invitation FOREIGN KEY (invitation_id) REFERENCES meeting_dial_in_invitations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS meeting_dial_in_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invitation_id BIGINT UNSIGNED NOT NULL,
  actor_user_id INT NOT NULL,
  channel VARCHAR(8) NOT NULL,
  request_key CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_dial_in_send (actor_user_id, request_key),
  KEY ix_dial_in_send_limit (invitation_id, channel, created_at)
) ENGINE=InnoDB;
