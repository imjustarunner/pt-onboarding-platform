-- Building imagery is distinct from the room gallery. Existing buildings stay photo-free.
ALTER TABLE office_locations ADD COLUMN building_photo_url VARCHAR(512) NULL;

-- Reviewer delivery now follows the active CPA role and agency access, not named people.
DROP TABLE IF EXISTS office_approval_email_reviewers;
