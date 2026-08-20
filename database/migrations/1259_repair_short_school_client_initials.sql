-- Migration 1259: repair short school-client initials to first-3 + last-3 from full_name
-- Example: "Fake2 Fake2" / "FF" -> "FAKFAK"; leaves TBD / empty names unchanged for manual review.

UPDATE clients c
SET c.initials = UPPER(CONCAT(
  LEFT(REGEXP_REPLACE(SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1), '[^A-Za-z]', ''), 3),
  LEFT(REGEXP_REPLACE(
    CASE
      WHEN TRIM(c.full_name) LIKE '% %'
        THEN SUBSTRING_INDEX(TRIM(c.full_name), ' ', -1)
      ELSE SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1)
    END,
    '[^A-Za-z]',
    ''
  ), 3)
))
WHERE c.client_type = 'school'
  AND c.full_name IS NOT NULL
  AND TRIM(c.full_name) <> ''
  AND (
    c.initials IS NULL
    OR TRIM(c.initials) = ''
    OR CHAR_LENGTH(REGEXP_REPLACE(UPPER(TRIM(c.initials)), '[^A-Z]', '')) <> 6
  )
  AND CHAR_LENGTH(REGEXP_REPLACE(SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1), '[^A-Za-z]', '')) >= 1
  AND CHAR_LENGTH(REGEXP_REPLACE(
    CASE
      WHEN TRIM(c.full_name) LIKE '% %'
        THEN SUBSTRING_INDEX(TRIM(c.full_name), ' ', -1)
      ELSE SUBSTRING_INDEX(TRIM(c.full_name), ' ', 1)
    END,
    '[^A-Za-z]',
    ''
  )) >= 1;
