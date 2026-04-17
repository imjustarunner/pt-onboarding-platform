-- Hiring reference requests (tokenized public forms), applicant consent on profile,
-- and optional agency-level sender identity for reference-related email.

CREATE TABLE IF NOT EXISTS hiring_reference_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hiring_profile_id INT NOT NULL,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  reference_index SMALLINT NOT NULL DEFAULT 0 COMMENT 'Index into hiring_profiles.references_json at send time',
  reference_name VARCHAR(255) NOT NULL,
  reference_email VARCHAR(255) NOT NULL,
  public_link_token VARCHAR(64) NOT NULL COMMENT 'Opaque token embedded in the public URL (stored for reminders, treat as secret in transit)',
  token_expires_at DATETIME NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'sent' COMMENT 'draft, sent, completed, expired, cancelled',
  sent_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  responses_json JSON NULL,
  reminder_3d_sent_at TIMESTAMP NULL DEFAULT NULL,
  reminder_24h_sent_at TIMESTAMP NULL DEFAULT NULL,
  sent_by_user_id INT NULL,
  intake_submission_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_ref_public_token (public_link_token),
  INDEX idx_hiring_ref_profile (hiring_profile_id),
  INDEX idx_hiring_ref_candidate (candidate_user_id),
  INDEX idx_hiring_ref_agency (agency_id),
  INDEX idx_hiring_ref_status_expiry (status, token_expires_at),
  CONSTRAINT fk_hrr_profile FOREIGN KEY (hiring_profile_id) REFERENCES hiring_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrr_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrr_sent_by FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE hiring_profiles
  ADD COLUMN references_consent_json JSON NULL COMMENT 'Applicant consent + waiver flags, versioned object',
  ADD COLUMN references_consent_at DATETIME NULL;

-- Column only: no FOREIGN KEY on agencies. Many deployments are at/near MySQL's 64-index limit on
-- `agencies` (dashboard/branding icon FKs). Adding another FK would fail with ER_TOO_MANY_KEYS.
-- Application code should treat this as email_sender_identities.id when set.
ALTER TABLE agencies
  ADD COLUMN hiring_reference_sender_identity_id INT NULL;
