-- Migration 1074: School onboarding invites + email template

CREATE TABLE IF NOT EXISTS school_onboarding_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  primary_user_id INT NOT NULL,
  contact_first_name VARCHAR(100) NOT NULL,
  contact_last_name VARCHAR(100) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  school_name VARCHAR(255) NOT NULL,
  invited_by_user_id INT NULL DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('invited', 'in_progress', 'submitted', 'expired', 'revoked') NOT NULL DEFAULT 'invited',
  step_progress JSON NULL,
  step_payload JSON NULL,
  password_set_at DATETIME NULL DEFAULT NULL,
  submitted_at DATETIME NULL DEFAULT NULL,
  last_viewed_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_onboarding_token (token),
  INDEX idx_school_onboarding_agency (agency_id, status),
  INDEX idx_school_onboarding_school (school_organization_id),
  INDEX idx_school_onboarding_user (primary_user_id),
  CONSTRAINT fk_school_onboarding_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_onboarding_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_onboarding_user
    FOREIGN KEY (primary_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_onboarding_invited_by
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type = 'school_onboarding_invite';

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES
(
  'School Onboarding Invite',
  'school_onboarding_invite',
  'Welcome to {{AGENCY_NAME}} — set up {{SCHOOL_NAME}}',
  'Hi {{CONTACT_NAME}},\n\n{{INVITED_BY_NAME}} from {{AGENCY_NAME}} invited you to set up the school portal for {{SCHOOL_NAME}}.\n\nUse this link to continue onboarding (your username will be your email: {{USERNAME}}):\n{{ONBOARDING_LINK}}\n\nYou can save progress and return anytime with this link.\n\nQuestions? Contact {{AGENCY_NAME}} at {{PEOPLE_OPS_EMAIL}}.\n\nThanks,\n{{AGENCY_NAME}}',
  NULL,
  @platform_branding_id,
  NULL
);
