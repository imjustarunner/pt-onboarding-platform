-- Migration 1758: one family signing session, and the school assignment introduction
-- The new demo provider has no password, no school assignment, and no client.

ALTER TABLE users
  ADD COLUMN family_introduction ENUM('support', 'profile')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'support'
    COMMENT 'How a new school assignment is introduced to the family';

CREATE TABLE IF NOT EXISTS family_document_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_token VARCHAR(64) NOT NULL,
  agency_id INT NOT NULL,
  guardian_user_id INT NULL,
  guardian_email VARCHAR(255) NOT NULL,
  created_by_user_id INT NULL,
  status ENUM('open', 'completed') NOT NULL DEFAULT 'open',
  confirmed_client_ids JSON NULL,
  delivery_status VARCHAR(32) NULL,
  sms_status VARCHAR(32) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY uq_family_document_sessions_token (public_token),
  INDEX idx_family_document_sessions_guardian (guardian_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_document_session_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  client_id INT NOT NULL,
  kind ENUM('disclosure', 'roi', 'demographics') NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  public_key VARCHAR(64) NULL,
  status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_family_document_items_session (session_id, sort_order),
  INDEX idx_family_document_items_key (public_key),
  CONSTRAINT fk_family_document_items_session
    FOREIGN KEY (session_id) REFERENCES family_document_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_introduction_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  reminder_token VARCHAR(64) NOT NULL,
  delivery_status ENUM('pending', 'sending', 'sent', 'skipped', 'failed') NOT NULL DEFAULT 'pending',
  reminder_opted_in_at TIMESTAMP NULL,
  communication_id INT NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  UNIQUE KEY uq_family_introduction_reminder (reminder_token),
  INDEX idx_family_introduction_pending (delivery_status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (
  email, username, personal_email, work_email,
  first_name, last_name, role, title, status,
  is_active, is_archived, is_hourly_worker, has_supervisor_privileges,
  sso_password_override, is_demo, family_introduction
)
SELECT
  'qa.provider.schoolswitch@example.com',
  'qa.provider.schoolswitch@example.com',
  'qa.provider.schoolswitch@example.com',
  'qa.provider.schoolswitch@example.com',
  'Quinn', 'Schoolswitch', 'provider', 'Provider', 'ACTIVE_EMPLOYEE',
  1, 0, 0, 0,
  0, 1, 'support'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'qa.provider.schoolswitch@example.com'
);

UPDATE users
SET is_demo = 1,
    family_introduction = 'support',
    role = 'provider',
    status = 'ACTIVE_EMPLOYEE',
    is_active = 1
WHERE email = 'qa.provider.schoolswitch@example.com';

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, 450, 1
FROM users u
WHERE u.email = 'qa.provider.schoolswitch@example.com'
  AND EXISTS (SELECT 1 FROM agencies a WHERE a.id = 450 AND a.organization_type = 'agency')
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = 450
  );
