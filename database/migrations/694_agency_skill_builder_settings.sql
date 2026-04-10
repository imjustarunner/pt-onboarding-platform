-- Global Skill Builder availability settings per agency.
-- force_confirm_enabled: when ON, all skill_builder_eligible users see the
--   confirmation popup on dashboard load (biweekly cycle).
-- required_hours_per_week: minimum hours a provider must cover per week
--   (was hardcoded as 6 throughout the codebase).

CREATE TABLE IF NOT EXISTS agency_skill_builder_settings (
  agency_id            INT          NOT NULL,
  force_confirm_enabled TINYINT(1)  NOT NULL DEFAULT 1,
  required_hours_per_week INT       NOT NULL DEFAULT 6,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id)
);
