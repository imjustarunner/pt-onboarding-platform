-- Club Manager Signup: Email verification + club-scoped membership (boot/inactive)
-- - users: email_verified_at, verification token for club manager signup
-- - user_agencies: is_active for club-scoped boot (person stays active in other clubs)

-- 1) Users: email verification for club managers
ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL AFTER status,
  ADD COLUMN email_verification_token VARCHAR(255) NULL AFTER email_verified_at,
  ADD COLUMN email_verification_token_expires_at TIMESTAMP NULL AFTER email_verification_token;

CREATE INDEX idx_users_email_verification_token ON users (email_verification_token);

-- 2) user_agencies: is_active for club-scoped membership (boot = inactive for that club only)
ALTER TABLE user_agencies
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER created_at;

CREATE INDEX idx_user_agencies_active ON user_agencies (agency_id, is_active, user_id);
