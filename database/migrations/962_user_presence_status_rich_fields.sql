-- Migration 962: rich status fields for unified chat + Team Board presence
-- Adds reason, display_label, and session_extend_until for admin/support away flow.
-- Also resets legacy admin default availability_level=offline so heartbeat can show them Online.

ALTER TABLE user_presence_status
  ADD COLUMN reason VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Quick reason: meal, fitness, family, personal, call, text, call_text, out_day, custom',
  ADD COLUMN display_label VARCHAR(120) NULL DEFAULT NULL
    COMMENT 'Human-readable status label shown in chat sidebar',
  ADD COLUMN session_extend_until TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When set, privileged users keep session alive (Away) until this time (max 2h)';

UPDATE user_presence up
INNER JOIN users u ON u.id = up.user_id
SET up.availability_level = 'everyone'
WHERE up.availability_level = 'offline'
  AND u.role IN ('admin', 'super_admin', 'support');
