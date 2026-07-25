-- Migration 1048: host/participant join tokens, waiting room, guest admissions

ALTER TABLE supervision_sessions
  ADD COLUMN host_join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque join link for supervisor/host (main room)',
  ADD COLUMN participant_join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque join link for supervisees/participants (lobby when waiting room on)',
  ADD COLUMN waiting_room_enabled TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 1, non-hosts wait in lobby until admitted';

CREATE UNIQUE INDEX uq_supervision_sessions_host_join_token
  ON supervision_sessions (host_join_token);

CREATE UNIQUE INDEX uq_supervision_sessions_participant_join_token
  ON supervision_sessions (participant_join_token);

-- Backfill: keep legacy join_token as participant link; mint host tokens
UPDATE supervision_sessions
SET participant_join_token = join_token
WHERE participant_join_token IS NULL
  AND join_token IS NOT NULL
  AND TRIM(join_token) <> '';

ALTER TABLE supervision_session_video_admissions
  ADD COLUMN join_identity VARCHAR(128) NULL DEFAULT NULL
  COMMENT 'user-{id} or guest-{key}; used for guest admits'
  AFTER user_id;

ALTER TABLE supervision_session_video_admissions
  MODIFY user_id INT NULL;

CREATE UNIQUE INDEX uq_ssva_session_join_identity
  ON supervision_session_video_admissions (session_id, join_identity);

-- Team meetings / huddles waiting room + role join tokens
ALTER TABLE provider_schedule_events
  ADD COLUMN host_join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque host join link for team meetings/huddles',
  ADD COLUMN participant_join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque participant join link (aliases join_token when set)',
  ADD COLUMN waiting_room_enabled TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 1, non-hosts wait until host admits';

CREATE UNIQUE INDEX uq_pse_host_join_token
  ON provider_schedule_events (host_join_token);

CREATE UNIQUE INDEX uq_pse_participant_join_token
  ON provider_schedule_events (participant_join_token);

UPDATE provider_schedule_events
SET participant_join_token = join_token
WHERE participant_join_token IS NULL
  AND join_token IS NOT NULL
  AND TRIM(join_token) <> ''
  AND UPPER(COALESCE(kind, '')) IN ('TEAM_MEETING', 'HUDDLE');

CREATE TABLE IF NOT EXISTS provider_schedule_event_join_presence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  join_identity VARCHAR(128) NOT NULL COMMENT 'user-{id} or guest-{uuid}',
  display_name VARCHAR(255) NULL,
  is_guest TINYINT(1) NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_pse_join_presence_event_identity (event_id, join_identity),
  KEY idx_pse_join_presence_active (event_id, left_at, last_seen_at),
  CONSTRAINT fk_pse_join_presence_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_schedule_event_video_admissions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NULL,
  join_identity VARCHAR(128) NULL,
  admitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pseva_event_user (event_id, user_id),
  UNIQUE KEY uq_pseva_event_identity (event_id, join_identity),
  CONSTRAINT fk_pseva_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pseva_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
