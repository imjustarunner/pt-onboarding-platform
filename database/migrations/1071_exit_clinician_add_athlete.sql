-- Migration 1071: add athlete role and exit clear-case legacy clinician rows
-- Keeps clinician in the ENUM for leftover review rows; migration 898 still blocks
-- NEW clinician inserts/reassignments. SSTC participation remains membership-based.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin',
    'assistant_admin',
    'supervisor',
    'facilitator',
    'intern',
    'super_admin',
    'support',
    'staff',
    'provider',
    'school_staff',
    'client_guardian',
    'clinical_practice_assistant',
    'provider_plus',
    'kiosk',
    'club_manager',
    'clinician',
    'athlete'
  )
  NULL
  DEFAULT 'provider';

-- ---------------------------------------------------------------------------
-- 1) SSTC-native clinicians → athlete
-- Only users whose active non-affiliation memberships are limited to Summit
-- Stats platform agencies (ssc / sstc / summit-stats). Dual-tenant leftovers
-- (e.g. ITSCO + SSTC) are left for manual review.
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'athlete'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND (
    EXISTS (
      SELECT 1
      FROM user_agencies ua
      INNER JOIN agencies a ON a.id = ua.agency_id
      WHERE ua.user_id = u.id
        AND COALESCE(ua.is_active, 1) = 1
        AND LOWER(COALESCE(a.slug, '')) IN ('ssc', 'sstc', 'summit-stats')
    )
    OR EXISTS (
      SELECT 1
      FROM user_agencies ua
      INNER JOIN agencies a ON a.id = ua.agency_id
      INNER JOIN organization_affiliations oa ON oa.organization_id = a.id AND COALESCE(oa.is_active, 1) = 1
      INNER JOIN agencies p ON p.id = oa.agency_id
      WHERE ua.user_id = u.id
        AND COALESCE(ua.is_active, 1) = 1
        AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
        AND LOWER(COALESCE(p.slug, '')) IN ('ssc', 'sstc', 'summit-stats')
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_agencies ua
    INNER JOIN agencies a ON a.id = ua.agency_id
    WHERE ua.user_id = u.id
      AND COALESCE(ua.is_active, 1) = 1
      AND LOWER(COALESCE(a.organization_type, '')) <> 'affiliation'
      AND LOWER(COALESCE(a.slug, '')) NOT IN ('ssc', 'sstc', 'summit-stats')
  );

-- ---------------------------------------------------------------------------
-- 2) Demo / testing clinicians → provider
-- Do not treat SSTC roster synthetics (@placeholder.sstc.local / roster-4-*) as demo.
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'provider'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND (
    LOWER(COALESCE(u.email, '')) LIKE '%@example.demo'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@example.invalid'
    OR LOWER(COALESCE(u.email, '')) LIKE '%.itsco-training@example.%'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@example.de'
    OR EXISTS (
      SELECT 1
      FROM user_agencies ua
      INNER JOIN agencies a ON a.id = ua.agency_id
      WHERE ua.user_id = u.id
        AND COALESCE(ua.is_active, 1) = 1
        AND (
          LOWER(COALESCE(a.slug, '')) IN ('demo', 'itsco-demo')
          OR LOWER(COALESCE(a.slug, '')) LIKE '%demo%'
          OR LOWER(COALESCE(a.name, '')) LIKE '%demo itsco%'
          OR LOWER(COALESCE(a.name, '')) LIKE 'demo %'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Onboarding / prospective (+ nearby prehire) clinicians WITH application data → provider
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'provider'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND UPPER(COALESCE(u.status, '')) IN ('PROSPECTIVE', 'ONBOARDING', 'PREHIRE_OPEN', 'PREHIRE_REVIEW')
  AND (
    EXISTS (SELECT 1 FROM hiring_profiles hp WHERE hp.candidate_user_id = u.id)
    OR EXISTS (SELECT 1 FROM hiring_notes hn WHERE hn.candidate_user_id = u.id)
    OR EXISTS (SELECT 1 FROM hiring_research_reports hrr WHERE hrr.candidate_user_id = u.id)
    OR EXISTS (SELECT 1 FROM hiring_resume_parses hrp WHERE hrp.candidate_user_id = u.id)
    OR EXISTS (SELECT 1 FROM hiring_reference_requests hrf WHERE hrf.candidate_user_id = u.id)
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.assigned_to_user_id = u.id)
    OR EXISTS (SELECT 1 FROM user_documents ud WHERE ud.user_id = u.id)
    OR EXISTS (SELECT 1 FROM user_specific_documents usd WHERE usd.user_id = u.id)
    OR EXISTS (SELECT 1 FROM signed_documents sd WHERE sd.user_id = u.id)
    OR EXISTS (SELECT 1 FROM user_tracks ut WHERE ut.user_id = u.id)
    OR EXISTS (SELECT 1 FROM module_response_answers mra WHERE mra.user_id = u.id)
    OR EXISTS (
      SELECT 1
      FROM user_info_values uiv
      WHERE uiv.user_id = u.id
        AND NULLIF(TRIM(uiv.value), '') IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Leftover clinicians (no auto-flip) — run manually for review:
--
-- SELECT
--   u.id,
--   u.email,
--   u.first_name,
--   u.last_name,
--   u.role,
--   u.status,
--   GROUP_CONCAT(DISTINCT a.slug ORDER BY a.slug SEPARATOR ', ') AS agency_slugs,
--   GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agency_names,
--   (
--     EXISTS (SELECT 1 FROM hiring_profiles hp WHERE hp.candidate_user_id = u.id)
--     OR EXISTS (SELECT 1 FROM tasks t WHERE t.assigned_to_user_id = u.id)
--     OR EXISTS (SELECT 1 FROM user_documents ud WHERE ud.user_id = u.id)
--     OR EXISTS (SELECT 1 FROM signed_documents sd WHERE sd.user_id = u.id)
--     OR EXISTS (SELECT 1 FROM user_tracks ut WHERE ut.user_id = u.id)
--     OR EXISTS (SELECT 1 FROM module_response_answers mra WHERE mra.user_id = u.id)
--     OR EXISTS (
--       SELECT 1 FROM user_info_values uiv
--       WHERE uiv.user_id = u.id AND NULLIF(TRIM(uiv.value), '') IS NOT NULL
--     )
--   ) AS has_app_data
-- FROM users u
-- LEFT JOIN user_agencies ua ON ua.user_id = u.id AND COALESCE(ua.is_active, 1) = 1
-- LEFT JOIN agencies a ON a.id = ua.agency_id
-- WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
-- GROUP BY u.id
-- ORDER BY u.status, u.last_name, u.first_name, u.id;
-- ---------------------------------------------------------------------------
