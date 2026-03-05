CREATE TABLE IF NOT EXISTS referral_packet_upload_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NULL,
  phi_document_id INT NULL,
  submission_date DATE NULL,
  upload_note VARCHAR(500) NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  initials VARCHAR(16) NULL,
  status ENUM('draft', 'submitting', 'submitted', 'failed', 'cancelled') NOT NULL DEFAULT 'draft',
  created_client_id INT NULL,
  last_error VARCHAR(500) NULL,
  submitted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_referral_packet_drafts_org_status (organization_id, status),
  INDEX idx_referral_packet_drafts_agency (agency_id),
  INDEX idx_referral_packet_drafts_user (uploaded_by_user_id),
  INDEX idx_referral_packet_drafts_client (created_client_id),
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_client_id) REFERENCES clients(id) ON DELETE SET NULL
);

ALTER TABLE client_phi_documents
  MODIFY COLUMN client_id INT NULL;

ALTER TABLE client_phi_documents
  ADD COLUMN referral_draft_id INT NULL AFTER intake_submission_id,
  ADD INDEX idx_phi_documents_referral_draft (referral_draft_id),
  ADD CONSTRAINT fk_phi_documents_referral_draft
    FOREIGN KEY (referral_draft_id) REFERENCES referral_packet_upload_drafts(id) ON DELETE SET NULL;

ALTER TABLE client_referral_ocr_requests
  MODIFY COLUMN client_id INT NULL;

ALTER TABLE client_referral_ocr_requests
  ADD COLUMN referral_draft_id INT NULL AFTER client_id,
  ADD INDEX idx_referral_ocr_draft (referral_draft_id),
  ADD CONSTRAINT fk_referral_ocr_draft
    FOREIGN KEY (referral_draft_id) REFERENCES referral_packet_upload_drafts(id) ON DELETE CASCADE;
