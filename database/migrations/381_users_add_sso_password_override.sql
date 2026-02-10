-- Allow per-user admin override for Workspace-only login policy.
-- When true, password reset/temp password flows remain available even if org+role requires Google SSO.
ALTER TABLE users
  ADD COLUMN sso_password_override TINYINT(1) NOT NULL DEFAULT 0
  AFTER is_hourly_worker;
