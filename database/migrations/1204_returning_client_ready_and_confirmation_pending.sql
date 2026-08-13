-- Migration 1204: Past-year / stuck school clients — Ready to Schedule vs Fall Confirmation Pending.
-- Only remaps legacy pipeline keys (current/pending/onboarded/returning), not active Being Seen.
-- Provider + weekday → ready_to_schedule; provider without weekday → confirmation_pending.
-- Also terminate leftovers where fall continuation recommended terminate but status never flipped.

-- Provider + active weekday → Ready to Schedule
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_rts
  ON cs_rts.agency_id = c.agency_id
 AND LOWER(cs_rts.status_key) = 'ready_to_schedule'
 AND cs_rts.is_active = TRUE
SET c.client_status_id = cs_rts.id
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) IN ('current', 'onboarded', 'pending', 'returning')
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND (
    c.provider_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM client_provider_assignments cpa0
      WHERE cpa0.client_id = c.id AND cpa0.is_active = TRUE
    )
  )
  AND EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
      AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')
  );

-- Provider, no weekday → Fall Confirmation Pending
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_cp
  ON cs_cp.agency_id = c.agency_id
 AND LOWER(cs_cp.status_key) = 'confirmation_pending'
 AND cs_cp.is_active = TRUE
SET c.client_status_id = cs_cp.id
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) IN ('current', 'onboarded', 'pending', 'returning', 'ready_to_schedule')
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND (
    c.provider_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM client_provider_assignments cpa0
      WHERE cpa0.client_id = c.id AND cpa0.is_active = TRUE
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
      AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')
  );

-- Fall continuation recommended terminate but status never flipped (e.g. MilLop-style leftovers)
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_term
  ON cs_term.agency_id = c.agency_id
 AND LOWER(cs_term.status_key) = 'terminated'
 AND cs_term.is_active = TRUE
SET c.client_status_id = cs_term.id,
    c.terminated_at = COALESCE(c.terminated_at, CURRENT_TIMESTAMP),
    c.termination_reason = COALESCE(
      NULLIF(TRIM(c.termination_reason), ''),
      'Fall continuation — termination recommended (backfill)'
    ),
    c.provider_id = NULL,
    c.service_day = NULL
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('terminated', 'archived')
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND c.continuation_services_json IS NOT NULL
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(c.continuation_services_json, '$.plan')) = 'not_continue_school'
    OR JSON_EXTRACT(c.continuation_services_json, '$.recommendTerminate') = true
    OR JSON_UNQUOTE(JSON_EXTRACT(c.continuation_services_json, '$.recommendTerminate')) IN ('true', '1')
  );

UPDATE client_provider_assignments cpa
JOIN clients c ON c.id = cpa.client_id
JOIN client_statuses cs ON cs.id = c.client_status_id
SET cpa.is_active = FALSE, cpa.updated_at = CURRENT_TIMESTAMP
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) = 'terminated'
  AND cpa.is_active = TRUE
  AND c.continuation_services_json IS NOT NULL
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(c.continuation_services_json, '$.plan')) = 'not_continue_school'
    OR JSON_EXTRACT(c.continuation_services_json, '$.recommendTerminate') = true
    OR JSON_UNQUOTE(JSON_EXTRACT(c.continuation_services_json, '$.recommendTerminate')) IN ('true', '1')
  );

-- Stuck legacy current/pending with no provider after fall remove-from-assignment → Confirmation Pending
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
INNER JOIN client_statuses cs_cp
  ON cs_cp.agency_id = c.agency_id
 AND LOWER(cs_cp.status_key) = 'confirmation_pending'
 AND cs_cp.is_active = TRUE
SET c.client_status_id = cs_cp.id
WHERE c.client_type = 'school'
  AND LOWER(COALESCE(cs.status_key, '')) IN ('current', 'onboarded', 'pending')
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND c.provider_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
  );
