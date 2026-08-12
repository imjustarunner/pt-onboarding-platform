-- Migration 1195: school staff account-access email queue + templates
-- Staggered bulk "recovery" and "access your portal" emails from School Staff Accounts.

CREATE TABLE school_staff_account_access_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  email_type VARCHAR(64) NOT NULL COMMENT 'school_staff_account_recovery | school_staff_portal_access',
  template_id INT NULL,
  sender_identity_id INT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  stagger_seconds INT NOT NULL DEFAULT 30,
  status VARCHAR(32) NOT NULL DEFAULT 'queued' COMMENT 'queued, sending, completed, cancelled',
  total_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  INDEX idx_ssaas_status (status, created_at),
  INDEX idx_ssaas_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE school_staff_account_access_send_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  send_id INT NOT NULL,
  user_id INT NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued' COMMENT 'queued, sending, sent, failed, skipped',
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  error_message VARCHAR(500) NULL,
  communication_id INT NULL,
  INDEX idx_ssaasi_due (status, scheduled_at),
  INDEX idx_ssaasi_send (send_id, status),
  CONSTRAINT fk_ssaasi_send
    FOREIGN KEY (send_id) REFERENCES school_staff_account_access_sends(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type IN ('school_staff_account_recovery', 'school_staff_portal_access');

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES
(
  'School Staff Account Recovery',
  'school_staff_account_recovery',
  'Set your {{AGENCY_NAME}} portal password',
  'Hello {{FIRST_NAME}},\n\nWe set up a password reset so you can access the {{AGENCY_NAME}} school staff portal.\n\nSet your password using this link (expires in 48 hours):\n{{RESET_TOKEN_LINK}}\n\nUsername: {{USERNAME}}\nPortal: {{PORTAL_LOGIN_LINK}}\n\nImportant: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.\n\nIf you did not expect this email, you can ignore it.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'School Staff Portal Access',
  'school_staff_portal_access',
  'Access your {{AGENCY_NAME}} portal',
  'Hello {{FIRST_NAME}},\n\nYou have an account for the {{AGENCY_NAME}} school staff portal.\n\nAccess your portal:\n{{PORTAL_LOGIN_LINK}}\n\nIf you have not set a password yet, use this link to set one (expires in 48 hours):\n{{RESET_TOKEN_LINK}}\n\nUsername: {{USERNAME}}\n\nImportant: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.\n\nIf you did not expect this email, you can ignore it.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
);
