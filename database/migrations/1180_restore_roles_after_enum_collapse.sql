-- Migration 1180: restore users.role after ENUM collapse to ancient 5-value set
--
-- Failure mode (seen again Aug 10 2026 on stage):
--   users.role was reduced to ENUM('admin','supervisor','clinician','facilitator','intern')
--   DEFAULT 'clinician'. That remaps / loses provider, school_staff, guardian, athlete,
--   super_admin, etc. Audit often shows ZERO UPDATEs TO clinician (ALTER/restore bypasses
--   normal role-change semantics).
--
-- Repair:
--   1) Expand ENUM (include clinician temporarily)
--   2) Drop audit trigger briefly (cannot UPDATE users while reading users_role_change_audit)
--   3) Restore each clinician from latest non-clinician audit new_role via TEMP table
--   4) Re-apply clear bucket heuristics for leftovers (same spirit as 1080)
--   5) Remaining clinicians → provider
--   6) DROP clinician from ENUM and set DEFAULT provider
--   7) Re-assert block/audit triggers
--
-- Never re-run 000_consolidated_fresh_database.sql against a live DB.

-- ---------------------------------------------------------------------------
-- 0) Expand ENUM so legitimate roles can be written again
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
-- 1) Known platform accounts
-- ---------------------------------------------------------------------------
UPDATE users
SET role = 'super_admin'
WHERE LOWER(email) IN ('superadmin@plottwistco.com', 'michael@plottwistco.com')
  AND LOWER(COALESCE(role, '')) <> 'super_admin';

-- ---------------------------------------------------------------------------
-- 2) Restore from latest audited non-clinician role (via temp table)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_role_change_audit;

DROP TEMPORARY TABLE IF EXISTS tmp_role_restore;
CREATE TEMPORARY TABLE tmp_role_restore AS
SELECT a.user_id, a.new_role
FROM users_role_change_audit a
INNER JOIN (
  SELECT user_id, MAX(changed_at) AS mx
  FROM users_role_change_audit
  WHERE LOWER(COALESCE(new_role, '')) NOT IN ('clinician', '')
  GROUP BY user_id
) latest
  ON latest.user_id = a.user_id
 AND latest.mx = a.changed_at
WHERE LOWER(COALESCE(a.new_role, '')) NOT IN ('clinician', '');

UPDATE users u
INNER JOIN tmp_role_restore r ON r.user_id = u.id
SET u.role = r.new_role
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND r.new_role IN (
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
  );

DROP TEMPORARY TABLE IF EXISTS tmp_role_restore;

-- ---------------------------------------------------------------------------
-- 3) SSTC-native leftovers → athlete
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
-- 4) Guardian intake leftovers → client_guardian
-- ---------------------------------------------------------------------------
UPDATE users u
SET u.role = 'client_guardian'
WHERE LOWER(COALESCE(u.role, '')) = 'clinician'
  AND EXISTS (
    SELECT 1 FROM intake_submissions isub WHERE isub.guardian_user_id = u.id
  );

-- ---------------------------------------------------------------------------
-- 5) School-only leftovers → school_staff
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
-- 6) Remaining clinicians → provider (exit hatch)
-- ---------------------------------------------------------------------------
UPDATE users
SET role = 'provider'
WHERE LOWER(COALESCE(role, '')) = 'clinician';

-- ---------------------------------------------------------------------------
-- 7) Permanently drop clinician + force DEFAULT provider
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

-- ---------------------------------------------------------------------------
-- 8) Re-assert guards
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_block_clinician_regression;
DROP TRIGGER IF EXISTS trg_users_block_clinician_insert;
DROP TRIGGER IF EXISTS trg_users_role_change_audit;

CREATE TRIGGER trg_users_role_change_audit
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF NOT (OLD.role <=> NEW.role) THEN
    INSERT INTO users_role_change_audit (user_id, old_role, new_role, db_user)
    VALUES (NEW.id, OLD.role, NEW.role, USER());
  END IF;
END;

CREATE TRIGGER trg_users_block_clinician_regression
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  IF LOWER(COALESCE(NEW.role, '')) = 'clinician' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked: clinician role is permanently retired (migration 1080/1180). Use provider/athlete/school_staff/client_guardian.';
  END IF;
END;

CREATE TRIGGER trg_users_block_clinician_insert
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  IF LOWER(COALESCE(NEW.role, '')) = 'clinician' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Blocked: clinician role is permanently retired (migration 1080/1180). Use provider/athlete/school_staff/client_guardian.';
  END IF;
END;

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
  'post-1180 role restore after ENUM collapse';
