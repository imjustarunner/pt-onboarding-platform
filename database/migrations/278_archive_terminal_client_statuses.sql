-- Migration: Normalize terminal client statuses to ARCHIVED
-- Why:
-- - We no longer support separate client_statuses entries for "dead" or "terminated".
-- - Terminal client statuses should be represented by workflow status clients.status = 'ARCHIVED'
--   and the catalog status_key = 'archived'.
--
-- This migration:
-- 1) Ensures client_statuses(status_key='archived') exists for any agency that has dead/terminated statuses.
-- 2) Remaps clients referencing dead/terminated client_statuses to archived and sets workflow status to ARCHIVED.
-- 3) Deactivates dead/terminated client_statuses so they no longer appear in UI pickers.

-- 1) Ensure archived catalog status exists per affected agency (idempotent).
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT DISTINCT
  cs.agency_id,
  'archived' AS status_key,
  'Archived' AS label,
  'Client is archived (terminal status)' AS description,
  TRUE AS is_active
FROM client_statuses cs
WHERE cs.status_key IN ('dead', 'terminated')
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  is_active = TRUE;

-- 2) Remap clients from dead/terminated -> archived (idempotent).
UPDATE clients c
JOIN client_statuses term
  ON term.id = c.client_status_id
 AND term.agency_id = c.agency_id
JOIN client_statuses arch
  ON arch.agency_id = c.agency_id
 AND arch.status_key = 'archived'
SET
  c.status = 'ARCHIVED',
  c.client_status_id = arch.id
WHERE term.status_key IN ('dead', 'terminated');

-- 3) Deactivate dead/terminated catalog statuses (keep for audit/history).
UPDATE client_statuses
SET is_active = FALSE
WHERE status_key IN ('dead', 'terminated');

