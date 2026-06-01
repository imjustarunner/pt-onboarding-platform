-- Migration 831: Skill Builders session observation logs (kiosk capture, portal review, encrypted)

CREATE TABLE skill_builders_session_observation_entries (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id         INT UNSIGNED NOT NULL,
  company_event_id  INT UNSIGNED NOT NULL,
  client_id         INT UNSIGNED NOT NULL,
  author_user_id    INT UNSIGNED NOT NULL COMMENT 'Staff who logged the observation at kiosk',
  session_id        INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'skill_builders_event_sessions.id when resolvable from session_date',
  session_date      DATE NOT NULL COMMENT 'Program calendar date for grouping entries',
  payload_enc       LONGTEXT NOT NULL COMMENT 'Encrypted JSON observation payload',
  expires_at        DATETIME NULL DEFAULT NULL COMMENT 'Optional TTL aligned with clinical copy-aid retention',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sb_obs_event_date_client (company_event_id, session_date, client_id),
  INDEX idx_sb_obs_author_date (author_user_id, session_date),
  INDEX idx_sb_obs_agency (agency_id),
  INDEX idx_sb_obs_session (session_id),
  INDEX idx_sb_obs_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE skill_builders_session_observation_daily_summaries (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id             INT UNSIGNED NOT NULL,
  company_event_id      INT UNSIGNED NOT NULL,
  client_id             INT UNSIGNED NOT NULL,
  session_date          DATE NOT NULL,
  entry_count           INT UNSIGNED NOT NULL DEFAULT 0,
  source_entry_ids_json JSON NULL COMMENT 'Array of entry ids included in summary',
  summary_enc           LONGTEXT NOT NULL COMMENT 'Encrypted AI narrative',
  generated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by_user_id  INT UNSIGNED NOT NULL,
  model_name            VARCHAR(128) NULL DEFAULT NULL,
  UNIQUE KEY uniq_sb_obs_summary_client_day (company_event_id, client_id, session_date),
  INDEX idx_sb_obs_sum_agency (agency_id),
  INDEX idx_sb_obs_sum_date (session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
