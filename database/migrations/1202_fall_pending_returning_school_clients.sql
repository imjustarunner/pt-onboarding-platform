-- Migration 1202: Fall 2026 — demote pre-July school clients with no weekday to pending;
-- keep/set current when they have a real weekday assignment.
--
-- Treats NULL / blank / 'Unknown' service_day as no day (active CPA rows alone are not enough).
-- Does not touch archived, waitlist, or terminated clients.

-- Pending: pre-July 2026 school clients with a provider, but no real weekday
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
SET c.client_status_id = (
  SELECT cs_pending.id
  FROM client_statuses cs_pending
  WHERE cs_pending.agency_id = c.agency_id
    AND LOWER(cs_pending.status_key) = 'pending'
  ORDER BY cs_pending.id ASC
  LIMIT 1
)
WHERE c.client_type = 'school'
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('waitlist', 'terminated', 'archived', 'pending')
  AND (
    (c.submission_date IS NOT NULL AND DATE(c.submission_date) < '2026-07-01')
    OR (c.submission_date IS NULL AND DATE(c.created_at) < '2026-07-01')
  )
  AND (
    c.provider_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM client_provider_assignments cpa0
      WHERE cpa0.client_id = c.id AND cpa0.is_active = TRUE
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
      AND cpa.service_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
  )
  AND EXISTS (
    SELECT 1 FROM client_statuses cs_pending
    WHERE cs_pending.agency_id = c.agency_id
      AND LOWER(cs_pending.status_key) = 'pending'
  );

-- Current: pre-July 2026 school clients that DO have a weekday — ensure status is current
UPDATE clients c
INNER JOIN client_statuses cs ON cs.id = c.client_status_id
SET c.client_status_id = (
  SELECT cs_current.id
  FROM client_statuses cs_current
  WHERE cs_current.agency_id = c.agency_id
    AND LOWER(cs_current.status_key) = 'current'
  ORDER BY cs_current.id ASC
  LIMIT 1
)
WHERE c.client_type = 'school'
  AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
  AND LOWER(COALESCE(cs.status_key, '')) IN ('pending', 'onboarded', 'current')
  AND (
    (c.submission_date IS NOT NULL AND DATE(c.submission_date) < '2026-07-01')
    OR (c.submission_date IS NULL AND DATE(c.created_at) < '2026-07-01')
  )
  AND EXISTS (
    SELECT 1
    FROM client_provider_assignments cpa
    WHERE cpa.client_id = c.id
      AND cpa.is_active = TRUE
      AND cpa.service_day IS NOT NULL
      AND TRIM(cpa.service_day) <> ''
      AND LOWER(TRIM(cpa.service_day)) <> 'unknown'
      AND cpa.service_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
  )
  AND EXISTS (
    SELECT 1 FROM client_statuses cs_current
    WHERE cs_current.agency_id = c.agency_id
      AND LOWER(cs_current.status_key) = 'current'
  );
