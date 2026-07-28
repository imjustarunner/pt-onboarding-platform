-- Migration 1075: Theme Hogwarts demo school people as Order of the Phoenix / Harry Potter characters
-- Scoped only to agencies.slug = 'hogwarts'

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

-- Providers assigned to Hogwarts → Order of the Phoenix
UPDATE users u
INNER JOIN (
  SELECT ranked.user_id, ranked.rn
  FROM (
    SELECT psa.provider_user_id AS user_id,
           ROW_NUMBER() OVER (ORDER BY psa.provider_user_id) AS rn
    FROM (
      SELECT DISTINCT provider_user_id
      FROM provider_school_assignments
      WHERE @hogwarts_id IS NOT NULL
        AND school_organization_id = @hogwarts_id
    ) psa
  ) ranked
) x ON x.user_id = u.id
INNER JOIN (
  SELECT 1 AS rn, 'Albus' AS first_name, 'Dumbledore' AS last_name UNION ALL
  SELECT 2, 'Minerva', 'McGonagall' UNION ALL
  SELECT 3, 'Remus', 'Lupin' UNION ALL
  SELECT 4, 'Sirius', 'Black' UNION ALL
  SELECT 5, 'Nymphadora', 'Tonks' UNION ALL
  SELECT 6, 'Kingsley', 'Shacklebolt' UNION ALL
  SELECT 7, 'Alastor', 'Moody' UNION ALL
  SELECT 8, 'Arthur', 'Weasley' UNION ALL
  SELECT 9, 'Molly', 'Weasley' UNION ALL
  SELECT 10, 'Severus', 'Snape' UNION ALL
  SELECT 11, 'Rubeus', 'Hagrid' UNION ALL
  SELECT 12, 'Filius', 'Flitwick' UNION ALL
  SELECT 13, 'Pomona', 'Sprout' UNION ALL
  SELECT 14, 'Horace', 'Slughorn' UNION ALL
  SELECT 15, 'Sybil', 'Trelawney' UNION ALL
  SELECT 16, 'Aberforth', 'Dumbledore'
) names ON names.rn = x.rn
SET u.first_name = names.first_name,
    u.last_name = names.last_name
WHERE @hogwarts_id IS NOT NULL;

-- School staff on Hogwarts → Hogwarts professors / staff
UPDATE users u
INNER JOIN (
  SELECT ranked.user_id, ranked.rn
  FROM (
    SELECT u2.id AS user_id,
           ROW_NUMBER() OVER (ORDER BY u2.id) AS rn
    FROM users u2
    INNER JOIN user_agencies ua2 ON ua2.user_id = u2.id
    WHERE @hogwarts_id IS NOT NULL
      AND ua2.agency_id = @hogwarts_id
      AND LOWER(u2.role) = 'school_staff'
  ) ranked
) x ON x.user_id = u.id
INNER JOIN (
  SELECT 1 AS rn, 'Severus' AS first_name, 'Snape' AS last_name UNION ALL
  SELECT 2, 'Minerva', 'McGonagall' UNION ALL
  SELECT 3, 'Filius', 'Flitwick' UNION ALL
  SELECT 4, 'Pomona', 'Sprout' UNION ALL
  SELECT 5, 'Rubeus', 'Hagrid' UNION ALL
  SELECT 6, 'Horace', 'Slughorn' UNION ALL
  SELECT 7, 'Sybill', 'Trelawney' UNION ALL
  SELECT 8, 'Argus', 'Filch' UNION ALL
  SELECT 9, 'Poppy', 'Pomfrey' UNION ALL
  SELECT 10, 'Irma', 'Pince'
) names ON names.rn = x.rn
SET u.first_name = names.first_name,
    u.last_name = names.last_name
WHERE @hogwarts_id IS NOT NULL
  AND LOWER(u.role) = 'school_staff';

-- Students / clients at Hogwarts → Hogwarts students
UPDATE clients c
INNER JOIN (
  SELECT ranked.client_id, ranked.rn
  FROM (
    SELECT c2.id AS client_id,
           ROW_NUMBER() OVER (ORDER BY c2.id) AS rn
    FROM clients c2
    WHERE @hogwarts_id IS NOT NULL
      AND c2.organization_id = @hogwarts_id
  ) ranked
) x ON x.client_id = c.id
INNER JOIN (
  SELECT 1 AS rn, 'Harry Potter' AS full_name, 'HP' AS initials UNION ALL
  SELECT 2, 'Hermione Granger', 'HG' UNION ALL
  SELECT 3, 'Ron Weasley', 'RW' UNION ALL
  SELECT 4, 'Neville Longbottom', 'NL' UNION ALL
  SELECT 5, 'Luna Lovegood', 'LL' UNION ALL
  SELECT 6, 'Ginny Weasley', 'GW' UNION ALL
  SELECT 7, 'Draco Malfoy', 'DM' UNION ALL
  SELECT 8, 'Fred Weasley', 'FW' UNION ALL
  SELECT 9, 'George Weasley', 'GeW' UNION ALL
  SELECT 10, 'Cho Chang', 'CC' UNION ALL
  SELECT 11, 'Cedric Diggory', 'CD' UNION ALL
  SELECT 12, 'Seamus Finnigan', 'SF' UNION ALL
  SELECT 13, 'Dean Thomas', 'DT' UNION ALL
  SELECT 14, 'Lavender Brown', 'LB' UNION ALL
  SELECT 15, 'Parvati Patil', 'PP' UNION ALL
  SELECT 16, 'Padma Patil', 'PaP' UNION ALL
  SELECT 17, 'Hannah Abbott', 'HA' UNION ALL
  SELECT 18, 'Susan Bones', 'SB' UNION ALL
  SELECT 19, 'Ernie Macmillan', 'EM' UNION ALL
  SELECT 20, 'Justin Finch-Fletchley', 'JF' UNION ALL
  SELECT 21, 'Zacharias Smith', 'ZS' UNION ALL
  SELECT 22, 'Terry Boot', 'TB' UNION ALL
  SELECT 23, 'Michael Corner', 'MC' UNION ALL
  SELECT 24, 'Anthony Goldstein', 'AG' UNION ALL
  SELECT 25, 'Katie Bell', 'KB' UNION ALL
  SELECT 26, 'Angelina Johnson', 'AJ' UNION ALL
  SELECT 27, 'Alicia Spinnet', 'AS' UNION ALL
  SELECT 28, 'Oliver Wood', 'OW' UNION ALL
  SELECT 29, 'Lee Jordan', 'LJ' UNION ALL
  SELECT 30, 'Colin Creevey', 'CoC'
) names ON names.rn = x.rn
SET c.full_name = names.full_name,
    c.initials = names.initials
WHERE @hogwarts_id IS NOT NULL;
