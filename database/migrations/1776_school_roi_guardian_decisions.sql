-- Retain each guardian's signed decision separately. Existing signed artifacts stay unchanged.
CREATE TABLE IF NOT EXISTS client_school_roi_guardian_decisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  school_staff_user_id INT NOT NULL,
  intake_submission_id INT NOT NULL,
  decision ENUM('none', 'roi', 'roi_docs') NOT NULL,
  signed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roi_guardian_submission_staff (intake_submission_id, client_id, guardian_user_id, school_staff_user_id),
  KEY idx_roi_guardian_current (client_id, school_organization_id, guardian_user_id, school_staff_user_id, signed_at)
);

-- Keep legacy family links under recipient 0; new portal links belong to one guardian.
ALTER TABLE client_school_roi_signing_links
  ADD COLUMN recipient_guardian_user_id INT NOT NULL DEFAULT 0,
  DROP INDEX uq_client_school_roi_signing_links_client_school,
  ADD UNIQUE KEY uq_roi_client_school_recipient (client_id, school_organization_id, recipient_guardian_user_id);

-- A disclosure/consent update owns one independently completed request per guardian.
ALTER TABLE client_update_requests
  ADD COLUMN guardian_request_group_id INT NULL,
  ADD UNIQUE KEY uq_client_update_guardian_group (guardian_request_group_id, guardian_user_id);
