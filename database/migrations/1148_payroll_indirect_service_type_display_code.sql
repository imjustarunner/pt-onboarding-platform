-- Migration 1141: display code for Log Time activity types (e.g. SUP-06)
-- Lets admins view/set/change the short code shown on activity cards, claims,
-- and pay stubs. Auto-generated on create when left blank.
ALTER TABLE payroll_indirect_service_types
  ADD COLUMN display_code VARCHAR(20) NULL DEFAULT NULL
  COMMENT 'Short code shown on activity cards and pay stubs, e.g. SUP-06';
