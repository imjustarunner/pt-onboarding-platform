-- Migration: School ROI signing configuration and issued client ROI links
-- Description: Stores the reusable ROI intake link assigned to a school and the client-specific public ROI links issued from that school config.

CREATE TABLE IF NOT EXISTS school_roi_intake_link_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  intake_link_id INT NOT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_roi_intake_link_configs_school (school_organization_id),
  KEY idx_school_roi_intake_link_configs_link (intake_link_id),
  KEY idx_school_roi_intake_link_configs_created_by (created_by_user_id),
  KEY idx_school_roi_intake_link_configs_updated_by (updated_by_user_id)
);

CREATE TABLE IF NOT EXISTS client_school_roi_signing_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  intake_link_id INT NOT NULL,
  public_key VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'issued',
  issued_by_user_id INT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latest_intake_submission_id INT NULL,
  signed_at DATETIME NULL,
  completed_client_phi_document_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_school_roi_signing_links_client_school (client_id, school_organization_id),
  UNIQUE KEY uq_client_school_roi_signing_links_public_key (public_key),
  KEY idx_client_school_roi_signing_links_link (intake_link_id),
  KEY idx_client_school_roi_signing_links_submission (latest_intake_submission_id),
  KEY idx_client_school_roi_signing_links_status (status),
  KEY idx_client_school_roi_signing_links_signed_at (signed_at)
);
