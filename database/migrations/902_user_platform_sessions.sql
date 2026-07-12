-- Migration 902: platform session ledger (source of truth for login session time)
-- Immutable audit rows for active/inactive/billable time. Never updated by clients after end.

CREATE TABLE IF NOT EXISTS user_platform_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  end_reason VARCHAR(32) NULL COMMENT 'logout | timeout | forced | abandoned',
  -- Wall-clock phases (server-computed; client cannot inflate beyond elapsed)
  active_seconds INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Visible + not in timedown',
  inactive_seconds INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Time spent in timedown countdown(s)',
  billable_active_seconds INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Meaningful activity only (excludes mousemove-only idle)',
  timedown_count INT UNSIGNED NOT NULL DEFAULT 0,
  -- Anti-gamification signals (read-only in Audit Center)
  meaningful_event_count INT UNSIGNED NOT NULL DEFAULT 0,
  passive_event_count INT UNSIGNED NOT NULL DEFAULT 0,
  suspicion_score DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '0-100; higher = more likely automated',
  suspicion_flags JSON NULL,
  last_heartbeat_at DATETIME(3) NULL,
  last_meaningful_at DATETIME(3) NULL,
  phase ENUM('active', 'timedown', 'ended') NOT NULL DEFAULT 'active',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ups_session_id (session_id),
  KEY idx_ups_user_started (user_id, started_at),
  KEY idx_ups_agency_started (agency_id, started_at),
  KEY idx_ups_ended (ended_at),
  KEY idx_ups_phase (phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Source of truth for platform login sessions (active/inactive/billable time)';
