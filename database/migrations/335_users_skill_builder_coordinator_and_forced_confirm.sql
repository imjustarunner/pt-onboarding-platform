-- Migration: Skill Builder coordinator access + forced confirm flag
-- Description:
--  - has_skill_builder_coordinator_access: grants agency-scoped access to Skill Builder availability quick action
--  - skill_builder_confirm_required_next_login: forces provider to confirm next 2 weeks on next login
--
-- Note: migration runner ignores "already exists" errors

ALTER TABLE users
ADD COLUMN has_skill_builder_coordinator_access TINYINT(1) NOT NULL DEFAULT 0 AFTER skill_builder_eligible;

ALTER TABLE users
ADD COLUMN skill_builder_confirm_required_next_login TINYINT(1) NOT NULL DEFAULT 0 AFTER has_skill_builder_coordinator_access;

CREATE INDEX idx_users_has_skill_builder_coordinator_access
  ON users(has_skill_builder_coordinator_access);

CREATE INDEX idx_users_skill_builder_confirm_required_next_login
  ON users(skill_builder_confirm_required_next_login);

