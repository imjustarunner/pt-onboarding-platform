-- Migration 1086: Remove Chuckie Sullivan from Hogwarts demo school staff.

SET @hogwarts_id := (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

DELETE FROM user_agencies
WHERE agency_id = @hogwarts_id
  AND user_id = 748;

DELETE FROM school_contacts
WHERE school_organization_id = @hogwarts_id
  AND email = 'chuckie@d11.org';
