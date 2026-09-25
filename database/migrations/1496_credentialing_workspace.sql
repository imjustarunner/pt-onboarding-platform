CREATE TABLE IF NOT EXISTS credentialing_workflow_tracking (
  agency_id INT NOT NULL,
  subject_type VARCHAR(16) NOT NULL,
  credential_id INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'not_started',
  billing_group_npi_id INT NULL,
  revalidation_due DATE NULL,
  follow_up_date DATE NULL,
  next_action VARCHAR(1000) NULL,
  evidence_reference VARCHAR(500) NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,subject_type,credential_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credentialing_payer_links (
  agency_id INT NOT NULL,
  insurance_definition_id INT NOT NULL,
  payer_id VARCHAR(32) NOT NULL,
  evidence_reference VARCHAR(500) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,insurance_definition_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credentialing_workflow_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  subject_type VARCHAR(16) NOT NULL,
  record_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  before_json JSON NULL,
  after_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_credential_workflow_history (agency_id,subject_type,record_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
