-- Migration 1082: Restore Hogwarts school client initials to 3+3 uppercase letters from full_name
-- (first 3 of first name + first 3 of last name, e.g. Harry Potter -> HARPOT)

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

UPDATE clients c
SET c.initials = UPPER(CONCAT(
  LEFT(SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1), 3),
  LEFT(SUBSTRING_INDEX(TRIM(c.full_name), ' ', -1), 3)
))
WHERE @hogwarts_id IS NOT NULL
  AND c.organization_id = @hogwarts_id
  AND c.full_name IS NOT NULL
  AND TRIM(c.full_name) <> '';
