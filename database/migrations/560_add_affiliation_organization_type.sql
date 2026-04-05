-- Summit Stats Team Challenge: Add 'affiliation' organization type
-- Affiliations are program divisions (Corporate Wellness, School Fitness, etc.) under the Summit Stats Team Challenge agency.
-- Program Managers create and manage affiliations; Challenges (learning_program_classes) live within affiliations.

ALTER TABLE agencies
  MODIFY COLUMN organization_type ENUM('agency', 'school', 'program', 'learning', 'clinical', 'affiliation')
  NOT NULL DEFAULT 'agency';
