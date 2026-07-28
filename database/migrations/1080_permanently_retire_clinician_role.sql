-- Migration 1080: one-time repair after out-of-band users-table restore collapsed roles
--
-- IMPORTANT:
--   This is a ONE-TIME data repair for a restore that bypassed UPDATE triggers.
--   Going forward, NOTHING should bulk-switch user roles (not to clinician, not to
--   provider, not to anything). Role changes must be intentional per-user admin actions.
--
-- What happened Jul 28: cleanup migrations 1071-1073 ran successfully; later an
-- out-of-band users restore put ~446 clinicians back with DEFAULT='clinician'.
-- Audit showed ZERO rows changing TO clinician via UPDATE (restore bypassed triggers).
--
-- This migration:
--   1) Fixes ENUM default to provider
--   2) Reclassifies remaining clinician rows by clear buckets (SSTC/guardian/school/demo)
--      then leftover clinicians → provider as a one-time exit hatch
--   3) DROPS clinician from the ENUM so restore dumps cannot put that value back cleanly
--
-- Triggers are in migration 1081.

-- ---------------------------------------------------------------------------
-- 0) Ensure ENUM has all needed roles + DEFAULT provider (keep clinician temporarily)
-- ---------------------------------------------------------------------------
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
-- 1) Protect known platform accounts first
-- ---------------------------------------------------------------------------
UPDATE users
SET role = 'super_admin'
WHERE LOWER(email) = 'superadmin@plottwistco.com'
  AND LOWER(COALESCE(role, '')) <> 'super_admin';

-- ---------------------------------------------------------------------------
-- 2) SSTC-native clinicians → athlete
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
      INNER JOIN organization_affiliations oa
        ON oa.organization_id = a.id AND COALESCE(oa.is_active, 1) = 1
      INNER JOIN agencies p ON p.id = oa.agency_id
      WHERE ua.user_id = u.id
        AND COALESCE(ua.is_active, 1) = 1
        AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
        AND LOWER(COALESCE(p.slug, '')) IN ('ssc', 'sstc', 'summit-stats')
    )
    OR LOWER(COALESCE(u.email, '')) LIKE '%@placeholder.sstc.local'
    OR LOWER(COALESCE(u.email, '')) LIKE 'roster-4-%@%'
    OR LOWER(COALESCE(u.email, '')) LIKE 'placeholder-396-%@%'
    OR LOWER(COALESCE(u.email, '')) LIKE 'merged-%@placeholder.sstc.local'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_agencies ua
    INNER JOIN agencies a ON a.id = ua.agency_id
    WHERE ua.user_id = u.id
      AND COALESCE(ua.is_active, 1) = 1
      AND LOWER(COALESCE(a.organization_type, '')) IN ('agency', 'clinical', 'life_coach')
      AND LOWER(COALESCE(a.slug, '')) NOT IN ('ssc', 'sstc', 'summit-stats', 'demo', 'itsco-demo')
  );

-- ---------------------------------------------------------------------------
-- 3) Guardian intake signups → client_guardian
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'client_guardian'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND EXISTS (
    SELECT 1 FROM intake_submissions isub WHERE isub.guardian_user_id = u.id
  );

-- ---------------------------------------------------------------------------
-- 4) School-only contacts → school_staff
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'school_staff'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND (
    LOWER(COALESCE(u.email, '')) LIKE '%@ortonk8.org'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@d11.org'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@dpsk12.net'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@cmsd12.org'
    OR (
      EXISTS (
        SELECT 1
        FROM user_agencies ua
        INNER JOIN agencies a ON a.id = ua.agency_id
        WHERE ua.user_id = u.id
          AND COALESCE(ua.is_active, 1) = 1
          AND LOWER(COALESCE(a.organization_type, '')) = 'school'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_agencies ua
        INNER JOIN agencies a ON a.id = ua.agency_id
        WHERE ua.user_id = u.id
          AND COALESCE(ua.is_active, 1) = 1
          AND LOWER(COALESCE(a.organization_type, '')) IN ('agency', 'clinical', 'life_coach')
          AND LOWER(COALESCE(a.slug, '')) NOT IN ('demo', 'itsco-demo')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Demo / testing clinicians → provider
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'provider'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND (
    LOWER(COALESCE(u.email, '')) LIKE '%@example.demo'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@example.invalid'
    OR LOWER(COALESCE(u.email, '')) LIKE '%.itsco-training@example.%'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@example.de'
    OR LOWER(COALESCE(u.email, '')) LIKE '%@twistwell.com'
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
-- 6) Everyone still clinician → provider (exit entirely)
-- ---------------------------------------------------------------------------
UPDATE users
SET role = 'provider'
WHERE LOWER(COALESCE(role, '')) = 'clinician';

-- ---------------------------------------------------------------------------
-- 7) DROP clinician from ENUM permanently + force DEFAULT provider
-- ---------------------------------------------------------------------------
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
    'athlete'
  )
  NULL
  DEFAULT 'provider';

-- Integrity snapshot for ops monitoring
CREATE TABLE IF NOT EXISTS users_role_integrity_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  clinician_count INT NOT NULL DEFAULT 0,
  athlete_count INT NOT NULL DEFAULT 0,
  provider_count INT NOT NULL DEFAULT 0,
  role_default VARCHAR(64) NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uris_created (created_at)
);

INSERT INTO users_role_integrity_snapshots
  (clinician_count, athlete_count, provider_count, role_default, note)
SELECT
  (SELECT COUNT(*) FROM users WHERE LOWER(COALESCE(role, '')) = 'clinician'),
  (SELECT COUNT(*) FROM users WHERE LOWER(COALESCE(role, '')) = 'athlete'),
  (SELECT COUNT(*) FROM users WHERE LOWER(COALESCE(role, '')) = 'provider'),
  'provider',
  'post-1080 clinician retirement';
