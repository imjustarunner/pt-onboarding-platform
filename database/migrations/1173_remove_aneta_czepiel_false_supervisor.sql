-- Migration 1173: remove incorrect supervisor assignment for Aneta Czepiel
-- Aneta is a provider, not a clinical supervisor; her profile has no supervisor role.
-- The orphaned assignment incorrectly listed her as clinical supervisor for Caitlyn Sears.

DELETE FROM supervisor_assignments
WHERE supervisor_id = 8
  AND supervisee_id = 82
  AND agency_id = 2
  AND LOWER(COALESCE(supervisor_type, '')) = 'clinical';
