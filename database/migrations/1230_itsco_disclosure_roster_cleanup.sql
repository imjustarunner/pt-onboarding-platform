-- Migration 1230: Move ITSCO test/intern disclosure accounts to Demo, keep Trevor on NLU only,
-- and correct Loriana's role (admin, not intern).
--
-- Paper + virtual disclosure lists are built from user_agencies + provider_school_assignments.
-- Test interns and fake accounts were on the ITSCO roster (and often assigned to ITSCO schools),
-- so they appeared on every ITSCO school packet.

SET @itsco_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (
      LOWER(COALESCE(slug, '')) IN ('itsco')
      OR LOWER(COALESCE(portal_url, '')) IN ('itsco')
    )
  ORDER BY id ASC
  LIMIT 1
);

SET @demo_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (
      LOWER(COALESCE(slug, '')) IN ('demo', 'itsco-demo')
      OR LOWER(COALESCE(portal_url, '')) IN ('demo', 'itsco-demo')
    )
  ORDER BY CASE LOWER(COALESCE(slug, '')) WHEN 'demo' THEN 0 ELSE 1 END, id ASC
  LIMIT 1
);

SET @nlu_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (
      LOWER(COALESCE(slug, '')) LIKE '%nlu%'
      OR LOWER(COALESCE(name, '')) LIKE '%new life%'
      OR LOWER(COALESCE(name, '')) LIKE '%newlife%'
    )
    AND LOWER(COALESCE(slug, '')) NOT LIKE '%itsco%'
  ORDER BY id ASC
  LIMIT 1
);

-- ITSCO-affiliated school org ids (for deactivating school assignments / school memberships)
DROP TEMPORARY TABLE IF EXISTS tmp_itsco_school_ids;
CREATE TEMPORARY TABLE tmp_itsco_school_ids (id INT PRIMARY KEY);

INSERT IGNORE INTO tmp_itsco_school_ids (id)
SELECT organization_id FROM organization_affiliations
WHERE agency_id = @itsco_id AND COALESCE(is_active, 1) = 1;

INSERT IGNORE INTO tmp_itsco_school_ids (id)
SELECT school_organization_id FROM agency_schools
WHERE agency_id = @itsco_id;

-- ---------------------------------------------------------------------------
-- 1) Test / intern accounts: add Demo membership, leave ITSCO
-- ---------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_itsco_demo_move_users;
CREATE TEMPORARY TABLE tmp_itsco_demo_move_users (id INT PRIMARY KEY);

INSERT IGNORE INTO tmp_itsco_demo_move_users (id)
SELECT u.id
FROM users u
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'karen kool',
  'sloppy lady',
  'ada lovelace',
  'admin one',
  'qr tester',
  'robin williams',
  'piper finch'
);

INSERT IGNORE INTO tmp_itsco_demo_move_users (id)
SELECT u.id
FROM users u
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'jennifer ablondie',
  'amy carson',
  'jennifer thomas'
)
AND (
  LOWER(COALESCE(u.role, '')) IN ('intern', 'intern_plus')
  OR LOWER(COALESCE(u.credential, '')) LIKE '%intern%'
);

-- Demo membership
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT t.id, @demo_id, 1
FROM tmp_itsco_demo_move_users t
WHERE @demo_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

-- Deactivate ITSCO parent membership
UPDATE user_agencies ua
JOIN tmp_itsco_demo_move_users t ON t.id = ua.user_id
SET ua.is_active = 0
WHERE @itsco_id IS NOT NULL
  AND ua.agency_id = @itsco_id;

-- Deactivate ITSCO school org memberships
UPDATE user_agencies ua
JOIN tmp_itsco_demo_move_users t ON t.id = ua.user_id
JOIN tmp_itsco_school_ids s ON s.id = ua.agency_id
SET ua.is_active = 0
WHERE @itsco_id IS NOT NULL;

-- Deactivate ITSCO school provider assignments
UPDATE provider_school_assignments psa
JOIN tmp_itsco_demo_move_users t ON t.id = psa.provider_user_id
JOIN tmp_itsco_school_ids s ON s.id = psa.school_organization_id
SET psa.is_active = 0
WHERE @itsco_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Trevor Reynolds: NLU only (remove ITSCO, do not add Demo)
-- ---------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_trevor_users;
CREATE TEMPORARY TABLE tmp_trevor_users (id INT PRIMARY KEY);

INSERT IGNORE INTO tmp_trevor_users (id)
SELECT u.id
FROM users u
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) = 'trevor reynolds';

UPDATE user_agencies ua
JOIN tmp_trevor_users t ON t.id = ua.user_id
SET ua.is_active = 0
WHERE @itsco_id IS NOT NULL
  AND ua.agency_id = @itsco_id;

UPDATE user_agencies ua
JOIN tmp_trevor_users t ON t.id = ua.user_id
JOIN tmp_itsco_school_ids s ON s.id = ua.agency_id
SET ua.is_active = 0
WHERE @itsco_id IS NOT NULL;

UPDATE provider_school_assignments psa
JOIN tmp_trevor_users t ON t.id = psa.provider_user_id
JOIN tmp_itsco_school_ids s ON s.id = psa.school_organization_id
SET psa.is_active = 0
WHERE @itsco_id IS NOT NULL;

-- Keep / restore NLU membership if the NLU agency exists
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT t.id, @nlu_id, 1
FROM tmp_trevor_users t
WHERE @nlu_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

-- ---------------------------------------------------------------------------
-- 3) Loriana Pincente: billing admin, not an intern
-- ---------------------------------------------------------------------------
UPDATE users
SET role = 'admin'
WHERE LOWER(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))) = 'loriana pincente'
  AND LOWER(COALESCE(role, '')) IN ('intern', 'intern_plus');

-- ---------------------------------------------------------------------------
-- 4) Keep ITSCO employment, drop ITSCO school assignments so they no longer
--    appear on ITSCO paper/virtual disclosure (Melissa stays on NLU assignments).
-- ---------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_itsco_disclosure_exclude;
CREATE TEMPORARY TABLE tmp_itsco_disclosure_exclude (id INT PRIMARY KEY);

INSERT IGNORE INTO tmp_itsco_disclosure_exclude (id)
SELECT u.id
FROM users u
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'loriana pincente',
  'hannah inyart',
  'melissa mendez'
);

UPDATE provider_school_assignments psa
JOIN tmp_itsco_disclosure_exclude t ON t.id = psa.provider_user_id
JOIN tmp_itsco_school_ids s ON s.id = psa.school_organization_id
SET psa.is_active = 0
WHERE @itsco_id IS NOT NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_itsco_school_ids;
DROP TEMPORARY TABLE IF EXISTS tmp_itsco_demo_move_users;
DROP TEMPORARY TABLE IF EXISTS tmp_trevor_users;
DROP TEMPORARY TABLE IF EXISTS tmp_itsco_disclosure_exclude;
