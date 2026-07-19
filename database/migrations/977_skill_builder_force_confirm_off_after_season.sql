-- Migration 977: End school-year Skill Builder biweekly force-confirm (was intended to stop after May).
-- Turns off agency force-confirm defaults and clears per-user "confirm next login" locks.
-- Coordinators can still re-enable Force confirmation in Skill Builder availability settings.

ALTER TABLE agency_skill_builder_settings
  MODIFY COLUMN force_confirm_enabled TINYINT(1) NOT NULL DEFAULT 0;

UPDATE agency_skill_builder_settings
SET force_confirm_enabled = 0;

UPDATE users
SET skill_builder_confirm_required_next_login = 0
WHERE skill_builder_confirm_required_next_login = 1
   OR skill_builder_confirm_required_next_login = TRUE;
