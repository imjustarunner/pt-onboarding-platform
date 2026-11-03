-- A stable manual-absence identity prevents repeated SMS away notices.
ALTER TABLE user_call_settings ADD COLUMN vacation_mode_started_at DATETIME(6) NULL;
UPDATE user_call_settings SET vacation_mode_started_at = UTC_TIMESTAMP(6)
WHERE vacation_mode_enabled = 1 AND vacation_mode_started_at IS NULL;
