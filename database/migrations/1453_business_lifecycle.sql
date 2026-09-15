-- One engagement follows a business enquiry into its company workspace.
CREATE TABLE IF NOT EXISTS business_lifecycles (
  id CHAR(36) PRIMARY KEY,
  request_id CHAR(36) NULL,
  agency_id INT NULL,
  state_json JSON NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lifecycle_request (request_id),
  UNIQUE KEY uq_lifecycle_agency (agency_id),
  FOREIGN KEY (request_id) REFERENCES business_onboarding_requests(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_lifecycle_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lifecycle_id CHAR(36) NOT NULL,
  revision INT NOT NULL,
  actor_user_id INT NOT NULL,
  state_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lifecycle_revision (lifecycle_id, revision),
  FOREIGN KEY (lifecycle_id) REFERENCES business_lifecycles(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
