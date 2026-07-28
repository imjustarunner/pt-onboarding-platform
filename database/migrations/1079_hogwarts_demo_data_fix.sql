-- Migration 1079: Fix Hogwarts demo data
-- - Restore real provider names (undo 1075 provider renames)
-- - Add 4 new Order of the Phoenix provider characters (do not replace originals)
-- - Restore mis-renamed school-linked clinicians and add Hogwarts professor school_staff
-- - Derive client initials from full_name (clinical clients keep whole names)

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

SET @parent_agency_id = (
  SELECT agency_id FROM organization_affiliations
  WHERE organization_id = @hogwarts_id AND is_active = 1
  ORDER BY id ASC
  LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 1) Restore original Hogwarts provider names
-- ---------------------------------------------------------------------------
UPDATE users
SET first_name = 'Michael', last_name = 'Williams'
WHERE @hogwarts_id IS NOT NULL AND id = 595;

UPDATE users
SET first_name = 'Piper', last_name = 'Finch'
WHERE @hogwarts_id IS NOT NULL AND id = 596;

UPDATE users
SET first_name = 'Loriana', last_name = 'Pincente'
WHERE @hogwarts_id IS NOT NULL AND id = 601;

-- ---------------------------------------------------------------------------
-- 2) Restore Hogwarts-linked clinicians renamed in 1076 (not providers)
-- ---------------------------------------------------------------------------
UPDATE users
SET first_name = 'Chuckie', last_name = 'Sullivan'
WHERE @hogwarts_id IS NOT NULL AND id = 748;

UPDATE users
SET first_name = 'Skylar', last_name = 'Driver'
WHERE @hogwarts_id IS NOT NULL AND id = 749;

UPDATE users
SET first_name = 'Loriana', last_name = 'Pincente'
WHERE @hogwarts_id IS NOT NULL AND id = 750;

-- Restore real school contact rows that were overwritten with professor names/emails
UPDATE school_contacts
SET full_name = 'Chuckie Sullivan',
    email = 'chuckie@d11.org',
    is_primary = 1,
    is_school_admin = 1,
    is_scheduler = 0
WHERE @hogwarts_id IS NOT NULL
  AND school_organization_id = @hogwarts_id
  AND id = 1134;

UPDATE school_contacts
SET full_name = 'Skylar Driver',
    email = 'skyler@d11.org',
    is_primary = 0,
    is_school_admin = 0,
    is_scheduler = 0
WHERE @hogwarts_id IS NOT NULL
  AND school_organization_id = @hogwarts_id
  AND id = 1135;

-- ---------------------------------------------------------------------------
-- 3) Add 4 new Order of the Phoenix providers (new users, not replacements)
-- ---------------------------------------------------------------------------
INSERT INTO users (email, username, role, status, first_name, last_name, is_active)
SELECT v.email, v.email, 'provider', 'ACTIVE_EMPLOYEE', v.first_name, v.last_name, 1
FROM (
  SELECT 'order.sirius.black@itsco.health' AS email, 'Sirius' AS first_name, 'Black' AS last_name UNION ALL
  SELECT 'order.nymphadora.tonks@itsco.health', 'Nymphadora', 'Tonks' UNION ALL
  SELECT 'order.kingsley.shacklebolt@itsco.health', 'Kingsley', 'Shacklebolt' UNION ALL
  SELECT 'order.alastor.moody@itsco.health', 'Alastor', 'Moody'
) v
WHERE @hogwarts_id IS NOT NULL
  AND @parent_agency_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email));

-- Link new providers to parent agency + Hogwarts school
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @parent_agency_id, 1
FROM users u
WHERE @hogwarts_id IS NOT NULL
  AND @parent_agency_id IS NOT NULL
  AND LOWER(u.email) IN (
    'order.sirius.black@itsco.health',
    'order.nymphadora.tonks@itsco.health',
    'order.kingsley.shacklebolt@itsco.health',
    'order.alastor.moody@itsco.health'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @parent_agency_id
  );

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @hogwarts_id, 1
FROM users u
WHERE @hogwarts_id IS NOT NULL
  AND LOWER(u.email) IN (
    'order.sirius.black@itsco.health',
    'order.nymphadora.tonks@itsco.health',
    'order.kingsley.shacklebolt@itsco.health',
    'order.alastor.moody@itsco.health'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @hogwarts_id
  );

-- Basic Mon/Wed/Fri availability for demo providers
INSERT INTO provider_school_assignments (
  provider_user_id,
  school_organization_id,
  day_of_week,
  slots_total,
  slots_available,
  start_time,
  end_time,
  is_active
)
SELECT u.id, @hogwarts_id, d.day_of_week, d.slots_total, d.slots_available, d.start_time, d.end_time, 1
FROM users u
CROSS JOIN (
  SELECT 'Monday' AS day_of_week, 5 AS slots_total, 5 AS slots_available, '08:00:00' AS start_time, '15:00:00' AS end_time UNION ALL
  SELECT 'Wednesday', 5, 5, '08:00:00', '15:00:00' UNION ALL
  SELECT 'Friday', 4, 4, '08:30:00', '14:30:00'
) d
WHERE @hogwarts_id IS NOT NULL
  AND LOWER(u.email) IN (
    'order.sirius.black@itsco.health',
    'order.nymphadora.tonks@itsco.health',
    'order.kingsley.shacklebolt@itsco.health',
    'order.alastor.moody@itsco.health'
  )
  AND NOT EXISTS (
    SELECT 1 FROM provider_school_assignments psa
    WHERE psa.provider_user_id = u.id
      AND psa.school_organization_id = @hogwarts_id
      AND psa.day_of_week = d.day_of_week
  );

-- ---------------------------------------------------------------------------
-- 4) Hogwarts professor school_staff accounts + school_contacts
-- ---------------------------------------------------------------------------
-- If a prior partial run created a duplicate Hagrid, keep the original test account row.
DELETE u
FROM users u
INNER JOIN (SELECT id FROM users WHERE id = 1001) keeper ON keeper.id = 1001
WHERE u.id <> 1001
  AND LOWER(u.email) = 'rubeus.hagrid@hogwarts.edu';

-- Upgrade existing test onboarding Hagrid account to the demo professor email
UPDATE users
SET email = 'rubeus.hagrid@hogwarts.edu',
    username = 'rubeus.hagrid@hogwarts.edu',
    first_name = 'Rubeus',
    last_name = 'Hagrid',
    role = 'school_staff',
    status = 'ACTIVE_EMPLOYEE',
    is_active = 1
WHERE @hogwarts_id IS NOT NULL
  AND id = 1001;

INSERT INTO users (email, username, role, status, first_name, last_name, is_active)
SELECT v.email, v.email, 'school_staff', 'ACTIVE_EMPLOYEE', v.first_name, v.last_name, 1
FROM (
  SELECT 'severus.snape@hogwarts.edu' AS email, 'Severus' AS first_name, 'Snape' AS last_name, 1 AS is_primary, 1 AS is_school_admin, 0 AS is_scheduler UNION ALL
  SELECT 'minerva.mcgonagall@hogwarts.edu', 'Minerva', 'McGonagall', 0, 1, 0 UNION ALL
  SELECT 'filius.flitwick@hogwarts.edu', 'Filius', 'Flitwick', 0, 0, 0 UNION ALL
  SELECT 'pomona.sprout@hogwarts.edu', 'Pomona', 'Sprout', 0, 0, 0 UNION ALL
  SELECT 'rubeus.hagrid@hogwarts.edu', 'Rubeus', 'Hagrid', 0, 0, 0 UNION ALL
  SELECT 'horace.slughorn@hogwarts.edu', 'Horace', 'Slughorn', 0, 0, 0 UNION ALL
  SELECT 'sybill.trelawney@hogwarts.edu', 'Sybill', 'Trelawney', 0, 0, 0 UNION ALL
  SELECT 'argus.filch@hogwarts.edu', 'Argus', 'Filch', 0, 0, 1 UNION ALL
  SELECT 'poppy.pomfrey@hogwarts.edu', 'Poppy', 'Pomfrey', 0, 0, 0 UNION ALL
  SELECT 'irma.pince@hogwarts.edu', 'Irma', 'Pince', 0, 0, 0
) v
WHERE @hogwarts_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email));

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @hogwarts_id, 1
FROM users u
WHERE @hogwarts_id IS NOT NULL
  AND LOWER(u.email) IN (
    'severus.snape@hogwarts.edu',
    'minerva.mcgonagall@hogwarts.edu',
    'filius.flitwick@hogwarts.edu',
    'pomona.sprout@hogwarts.edu',
    'rubeus.hagrid@hogwarts.edu',
    'horace.slughorn@hogwarts.edu',
    'sybill.trelawney@hogwarts.edu',
    'argus.filch@hogwarts.edu',
    'poppy.pomfrey@hogwarts.edu',
    'irma.pince@hogwarts.edu'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @hogwarts_id
  );

INSERT INTO school_contacts (
  school_organization_id,
  full_name,
  email,
  is_primary,
  is_school_admin,
  is_scheduler
)
SELECT
  @hogwarts_id,
  CONCAT(v.first_name, ' ', v.last_name),
  v.email,
  v.is_primary,
  v.is_school_admin,
  v.is_scheduler
FROM (
  SELECT 'severus.snape@hogwarts.edu' AS email, 'Severus' AS first_name, 'Snape' AS last_name, 0 AS is_primary, 1 AS is_school_admin, 0 AS is_scheduler UNION ALL
  SELECT 'minerva.mcgonagall@hogwarts.edu', 'Minerva', 'McGonagall', 0, 1, 0 UNION ALL
  SELECT 'filius.flitwick@hogwarts.edu', 'Filius', 'Flitwick', 0, 0, 0 UNION ALL
  SELECT 'pomona.sprout@hogwarts.edu', 'Pomona', 'Sprout', 0, 0, 0 UNION ALL
  SELECT 'rubeus.hagrid@hogwarts.edu', 'Rubeus', 'Hagrid', 0, 0, 0 UNION ALL
  SELECT 'horace.slughorn@hogwarts.edu', 'Horace', 'Slughorn', 0, 0, 0 UNION ALL
  SELECT 'sybill.trelawney@hogwarts.edu', 'Sybill', 'Trelawney', 0, 0, 0 UNION ALL
  SELECT 'argus.filch@hogwarts.edu', 'Argus', 'Filch', 0, 0, 1 UNION ALL
  SELECT 'poppy.pomfrey@hogwarts.edu', 'Poppy', 'Pomfrey', 0, 0, 0 UNION ALL
  SELECT 'irma.pince@hogwarts.edu', 'Irma', 'Pince', 0, 0, 0
) v
WHERE @hogwarts_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_contacts sc
    WHERE sc.school_organization_id = @hogwarts_id
      AND LOWER(sc.email) = LOWER(v.email)
  );

-- Keep professor contact flags in sync when rows already exist
UPDATE school_contacts sc
INNER JOIN (
  SELECT 'severus.snape@hogwarts.edu' AS email, 'Severus Snape' AS full_name, 0 AS is_primary, 1 AS is_school_admin, 0 AS is_scheduler UNION ALL
  SELECT 'minerva.mcgonagall@hogwarts.edu', 'Minerva McGonagall', 0, 1, 0 UNION ALL
  SELECT 'filius.flitwick@hogwarts.edu', 'Filius Flitwick', 0, 0, 0 UNION ALL
  SELECT 'pomona.sprout@hogwarts.edu', 'Pomona Sprout', 0, 0, 0 UNION ALL
  SELECT 'rubeus.hagrid@hogwarts.edu', 'Rubeus Hagrid', 0, 0, 0 UNION ALL
  SELECT 'horace.slughorn@hogwarts.edu', 'Horace Slughorn', 0, 0, 0 UNION ALL
  SELECT 'sybill.trelawney@hogwarts.edu', 'Sybill Trelawney', 0, 0, 0 UNION ALL
  SELECT 'argus.filch@hogwarts.edu', 'Argus Filch', 0, 0, 1 UNION ALL
  SELECT 'poppy.pomfrey@hogwarts.edu', 'Poppy Pomfrey', 0, 0, 0 UNION ALL
  SELECT 'irma.pince@hogwarts.edu', 'Irma Pince', 0, 0, 0
) v ON LOWER(sc.email) = LOWER(v.email)
SET sc.full_name = v.full_name,
    sc.is_primary = v.is_primary,
    sc.is_school_admin = v.is_school_admin,
    sc.is_scheduler = v.is_scheduler
WHERE @hogwarts_id IS NOT NULL
  AND sc.school_organization_id = @hogwarts_id;

-- ---------------------------------------------------------------------------
-- 5) Clinical clients: keep full names and derive initials from full_name
-- ---------------------------------------------------------------------------
UPDATE clients c
SET c.initials = UPPER(CONCAT(
  LEFT(SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1), 1),
  LEFT(SUBSTRING_INDEX(TRIM(c.full_name), ' ', -1), 1)
))
WHERE @hogwarts_id IS NOT NULL
  AND c.organization_id = @hogwarts_id
  AND c.full_name IS NOT NULL
  AND TRIM(c.full_name) <> '';
