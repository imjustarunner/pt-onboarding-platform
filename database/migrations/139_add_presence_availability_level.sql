-- Migration: Add user presence availability level
-- Description:
-- Adds an availability control on top of heartbeat-based presence.
-- availability_level:
--   - 'offline'      -> user is treated as offline regardless of heartbeat
--   - 'admins_only'  -> only admin/super_admin can treat as online
--   - 'everyone'     -> normal behavior

ALTER TABLE user_presence
  ADD COLUMN availability_level VARCHAR(20) NULL AFTER last_activity_at;

CREATE INDEX idx_user_presence_availability_level ON user_presence (availability_level);

