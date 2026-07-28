-- Migration 1090: reconcile legacy clients.provider_id with org-scoped client_provider_assignments
-- Fixes school portal roster + provider year update for all clients, not only new assignments.

-- 1) Legacy provider_id -> missing CPA rows at each active org affiliation
INSERT INTO client_provider_assignments
  (client_id, organization_id, provider_user_id, service_day, is_active, is_primary, created_by_user_id, updated_by_user_id)
SELECT
  c.id,
  coa.organization_id,
  c.provider_id,
  CASE
    WHEN c.service_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday') THEN c.service_day
    ELSE NULL
  END,
  TRUE,
  TRUE,
  c.updated_by_user_id,
  c.updated_by_user_id
FROM clients c
INNER JOIN client_organization_assignments coa
  ON coa.client_id = c.id
 AND coa.is_active = TRUE
WHERE c.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.organization_id = coa.organization_id
      AND cpa.provider_user_id = c.provider_id
      AND cpa.is_active = TRUE
  )
ON DUPLICATE KEY UPDATE
  is_active = TRUE,
  is_primary = TRUE,
  updated_by_user_id = VALUES(updated_by_user_id),
  updated_at = CURRENT_TIMESTAMP;

-- 2) Active CPA -> legacy clients.provider_id when legacy field was never set
UPDATE clients c
INNER JOIN (
  SELECT cpa.client_id, cpa.provider_user_id, cpa.service_day
  FROM client_provider_assignments cpa
  INNER JOIN (
    SELECT client_id, MAX(id) AS pick_id
    FROM client_provider_assignments
    WHERE is_active = TRUE
    GROUP BY client_id
  ) latest ON latest.pick_id = cpa.id
) picked ON picked.client_id = c.id
SET
  c.provider_id = picked.provider_user_id,
  c.service_day = picked.service_day,
  c.updated_at = CURRENT_TIMESTAMP
WHERE c.provider_id IS NULL;
