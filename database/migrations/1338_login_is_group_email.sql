-- Migration 1338: Track when SSO-override login username/email is a Google Group mailbox
-- Password policy must not apply to pure SSO users; override accounts that use a group
-- address need an explicit flag so admins know the login is a group, not a Workspace user.

ALTER TABLE users
  ADD COLUMN login_is_group_email TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when login email/username is a Google Group mailbox (SSO password override / hire group accounts)';

-- Confirmed Google Group login among existing SSO-override accounts (Directory API).
UPDATE users
SET login_is_group_email = 1
WHERE sso_password_override = 1
  AND (
    LOWER(TRIM(email)) = 'williams@itsco.health'
    OR LOWER(TRIM(username)) = 'williams@itsco.health'
    OR LOWER(TRIM(work_email)) = 'williams@itsco.health'
  );
