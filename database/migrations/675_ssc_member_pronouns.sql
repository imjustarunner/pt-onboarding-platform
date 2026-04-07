-- SSC member pronouns support (club-configurable visibility)

ALTER TABLE challenge_member_applications
  ADD COLUMN pronouns VARCHAR(64) NULL AFTER gender;

