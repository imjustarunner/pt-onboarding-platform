-- Per-agency session timeout / heartbeat settings
ALTER TABLE agencies
  ADD COLUMN session_settings_json JSON NULL AFTER intake_retention_policy_json;
