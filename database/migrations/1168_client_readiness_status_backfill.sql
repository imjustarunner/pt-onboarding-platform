-- Migration 1168: Backfill real (non-demo) school clients into Client Readiness statuses.
-- Exclude Hogwarts / Durmstrang demo schools. Assume existing caseload clients have
-- completed staff readiness (onboarded). Promote to current only when they have a
-- provider AND a service day.

-- 1) Mark staff readiness complete + status onboarded for active real school clients
--    that are not already current/inactive/terminated/archived/waitlist.
UPDATE clients c
JOIN agencies school ON school.id = c.organization_id
LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
SET
  c.staff_onboarding_completed_at = COALESCE(c.staff_onboarding_completed_at, NOW()),
  c.client_status_id = (
    SELECT cs2.id
    FROM client_statuses cs2
    WHERE cs2.agency_id = c.agency_id
      AND cs2.status_key = 'onboarded'
    LIMIT 1
  )
WHERE school.organization_type = 'school'
  AND LOWER(COALESCE(school.slug, '')) NOT IN ('hogwarts', 'durmstrang')
  AND LOWER(COALESCE(school.portal_url, '')) NOT IN ('hogwarts', 'durmstrang')
  AND (c.status IS NULL OR UPPER(c.status) NOT IN ('ARCHIVED', 'DECLINED'))
  AND (
    cs.status_key IS NULL
    OR LOWER(cs.status_key) IN ('packet', 'pending', 'prospective', 'screener', 'onboarded')
  )
  AND EXISTS (
    SELECT 1
    FROM client_statuses cs_on
    WHERE cs_on.agency_id = c.agency_id
      AND cs_on.status_key = 'onboarded'
  );

-- 2) Promote to current when provider + service day are present.
UPDATE clients c
JOIN agencies school ON school.id = c.organization_id
LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
SET
  c.client_status_id = (
    SELECT cs2.id
    FROM client_statuses cs2
    WHERE cs2.agency_id = c.agency_id
      AND cs2.status_key = 'current'
    LIMIT 1
  ),
  c.status = CASE
    WHEN UPPER(COALESCE(c.status, '')) IN ('PENDING_REVIEW', 'PACKET', 'SCREENER', '') THEN 'ACTIVE'
    ELSE c.status
  END
WHERE school.organization_type = 'school'
  AND LOWER(COALESCE(school.slug, '')) NOT IN ('hogwarts', 'durmstrang')
  AND LOWER(COALESCE(school.portal_url, '')) NOT IN ('hogwarts', 'durmstrang')
  AND LOWER(COALESCE(cs.status_key, '')) IN ('onboarded', 'pending', 'packet')
  AND (
    c.provider_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM client_provider_assignments cpa
      WHERE cpa.client_id = c.id
        AND cpa.is_active = TRUE
    )
  )
  AND (
    (c.service_day IS NOT NULL AND TRIM(c.service_day) <> '')
    OR EXISTS (
      SELECT 1
      FROM client_provider_assignments cpa2
      WHERE cpa2.client_id = c.id
        AND cpa2.is_active = TRUE
        AND cpa2.service_day IS NOT NULL
        AND TRIM(cpa2.service_day) <> ''
    )
  )
  AND EXISTS (
    SELECT 1
    FROM client_statuses cs_cur
    WHERE cs_cur.agency_id = c.agency_id
      AND cs_cur.status_key = 'current'
  );
