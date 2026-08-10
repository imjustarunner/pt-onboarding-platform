-- Migration 1179: versioned signed school referral packet bundles for staff viewing

CREATE TABLE IF NOT EXISTS client_signed_school_packets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  intake_submission_id INT NULL,
  school_organization_id INT NULL,
  agency_id INT NULL,
  packet_version INT NULL COMMENT 'school_packet_templates.version at sign time',
  master_form_version INT NULL COMMENT 'agency_school_intake_masters.version at sign time',
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contents_json JSON NULL COMMENT 'Ordered list of artifacts: type, label, phiDocumentId, ackId, etc.',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_client_signed_school_packets_client (client_id, signed_at),
  KEY idx_client_signed_school_packets_submission (intake_submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
