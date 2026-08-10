-- Migration 1175: snapshot acknowledgements for packet-derived digital consent sections

CREATE TABLE IF NOT EXISTS client_packet_section_acknowledgements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NULL,
  intake_submission_id INT NULL,
  client_phi_document_id INT NULL,
  section_key VARCHAR(64) NOT NULL
    COMMENT 'informed_group_consent | policy_services',
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  signed_at DATETIME NOT NULL,
  signer_name VARCHAR(255) NULL,
  signer_email VARCHAR(255) NULL,
  content_hash VARCHAR(128) NULL,
  packet_version INT NULL
    COMMENT 'school_packet_templates.version at sign time',
  snapshot_html MEDIUMTEXT NULL
    COMMENT 'Frozen HTML shown to the signer at sign time',
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_packet_section_ack_client (client_id, section_key, signed_at),
  KEY idx_packet_section_ack_agency (agency_id),
  KEY idx_packet_section_ack_submission (intake_submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
