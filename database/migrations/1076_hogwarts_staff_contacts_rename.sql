-- Migration 1076: Rename Hogwarts school contacts / remaining school-linked clinicians
-- Complements 1075 (providers + clients). Hogwarts contacts are often clinician-role users.

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

-- Rename school_contacts display names
UPDATE school_contacts sc
INNER JOIN (
  SELECT ranked.id, ranked.rn
  FROM (
    SELECT sc2.id,
           ROW_NUMBER() OVER (ORDER BY sc2.id) AS rn
    FROM school_contacts sc2
    WHERE @hogwarts_id IS NOT NULL
      AND sc2.school_organization_id = @hogwarts_id
  ) ranked
) x ON x.id = sc.id
INNER JOIN (
  SELECT 1 AS rn, 'Severus Snape' AS full_name, 'severus.snape@hogwarts.edu' AS email UNION ALL
  SELECT 2, 'Minerva McGonagall', 'minerva.mcgonagall@hogwarts.edu' UNION ALL
  SELECT 3, 'Filius Flitwick', 'filius.flitwick@hogwarts.edu' UNION ALL
  SELECT 4, 'Pomona Sprout', 'pomona.sprout@hogwarts.edu' UNION ALL
  SELECT 5, 'Rubeus Hagrid', 'rubeus.hagrid@hogwarts.edu' UNION ALL
  SELECT 6, 'Horace Slughorn', 'horace.slughorn@hogwarts.edu' UNION ALL
  SELECT 7, 'Sybill Trelawney', 'sybill.trelawney@hogwarts.edu' UNION ALL
  SELECT 8, 'Argus Filch', 'argus.filch@hogwarts.edu' UNION ALL
  SELECT 9, 'Poppy Pomfrey', 'poppy.pomfrey@hogwarts.edu' UNION ALL
  SELECT 10, 'Irma Pince', 'irma.pince@hogwarts.edu'
) names ON names.rn = x.rn
SET sc.full_name = names.full_name,
    sc.email = names.email
WHERE @hogwarts_id IS NOT NULL;

-- Rename Hogwarts-linked users who are NOT already in provider_school_assignments
-- (those were renamed in 1075) — treat remaining as professors/staff.
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
      AND u2.id NOT IN (
        SELECT DISTINCT provider_user_id
        FROM provider_school_assignments
        WHERE school_organization_id = @hogwarts_id
      )
  ) ranked
) x ON x.user_id = u.id
INNER JOIN (
  SELECT 1 AS rn, 'Severus' AS first_name, 'Snape' AS last_name UNION ALL
  SELECT 2, 'Filius', 'Flitwick' UNION ALL
  SELECT 3, 'Pomona', 'Sprout' UNION ALL
  SELECT 4, 'Rubeus', 'Hagrid' UNION ALL
  SELECT 5, 'Horace', 'Slughorn' UNION ALL
  SELECT 6, 'Sybill', 'Trelawney' UNION ALL
  SELECT 7, 'Argus', 'Filch' UNION ALL
  SELECT 8, 'Poppy', 'Pomfrey' UNION ALL
  SELECT 9, 'Irma', 'Pince' UNION ALL
  SELECT 10, 'Rolanda', 'Hooch'
) names ON names.rn = x.rn
SET u.first_name = names.first_name,
    u.last_name = names.last_name
WHERE @hogwarts_id IS NOT NULL;
