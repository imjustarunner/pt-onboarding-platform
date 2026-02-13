-- Platform-level max inactivity timeout (SuperAdmin sets, agencies can override for less)
-- Default 30 minutes. Agencies may set a lower max in session_settings_json.
ALTER TABLE platform_branding
  ADD COLUMN max_inactivity_timeout_minutes INT NULL DEFAULT 30
  COMMENT 'Platform max minutes before lock/logout. Agencies can override with lower value.'
  AFTER id;
