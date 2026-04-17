-- Intake / summer program: persist eloping risk and extra assistance flags from public intake.

ALTER TABLE clients
  ADD COLUMN eloping_flag TINYINT(1) NULL DEFAULT NULL COMMENT 'From intake: eloping/wandering risk (yes/no)' AFTER preferred_language,
  ADD COLUMN extra_assistance_flag TINYINT(1) NULL DEFAULT NULL COMMENT 'From intake: extra assistance requested' AFTER eloping_flag,
  ADD COLUMN eloping_notes TEXT NULL AFTER extra_assistance_flag,
  ADD COLUMN extra_assistance_notes TEXT NULL AFTER eloping_notes;
