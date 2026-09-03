-- Migration 1361: pre-hire job config, encrypted background-check auth, handbook opens, checklist dates

ALTER TABLE hiring_job_descriptions
  ADD COLUMN prehire_config_json JSON NULL
    COMMENT 'Per-job prehire docs, checklists, cosigners, contract defaults';

CREATE TABLE hiring_background_check_authorizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  ciphertext_b64 MEDIUMTEXT NOT NULL,
  iv_b64 VARCHAR(64) NOT NULL,
  auth_tag_b64 VARCHAR(64) NOT NULL,
  key_id VARCHAR(50) NULL,
  ssn_last4 VARCHAR(4) NULL,
  dl_last4 VARCHAR(8) NULL,
  signed_at DATETIME NULL,
  signer_name VARCHAR(255) NULL,
  admin_doc_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bgcheck_user_agency (user_id, agency_id),
  INDEX idx_bgcheck_agency (agency_id),
  INDEX idx_bgcheck_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hiring_handbook_link_opens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  link_key VARCHAR(80) NOT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_handbook_open_user (user_id),
  INDEX idx_handbook_open_agency (agency_id, link_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hiring_prehire_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  item_key VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  instructions TEXT NULL,
  scheduled_on DATE NULL,
  completed_on DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prehire_checklist (user_id, item_key),
  INDEX idx_prehire_checklist_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
