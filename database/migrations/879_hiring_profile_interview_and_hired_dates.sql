-- Migration 879: Add interview_date to hiring_profiles and hired_at to users
-- interview_date: when the candidate was interviewed (set by staff or from scheduling)
-- hired_at: timestamp when the user was moved to PENDING_SETUP (marks start of pre-hire)

ALTER TABLE hiring_profiles
  ADD COLUMN interview_date DATETIME NULL DEFAULT NULL
    COMMENT 'Date/time of the interview for this candidate';

ALTER TABLE users
  ADD COLUMN hired_at DATETIME NULL DEFAULT NULL
    COMMENT 'Timestamp when this user was promoted to PENDING_SETUP (start of pre-hire pipeline)';

CREATE INDEX idx_hiring_profiles_interview_date ON hiring_profiles (interview_date);
CREATE INDEX idx_users_hired_at ON users (hired_at);
