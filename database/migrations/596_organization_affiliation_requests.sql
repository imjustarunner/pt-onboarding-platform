-- Affiliation requests: a second (or subsequent) parent agency may only link to a child org
-- after the organization approves the request (or super_admin bypasses on link).

CREATE TABLE IF NOT EXISTS organization_affiliation_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  requesting_agency_id INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  requested_by_user_id INT NULL,
  resolved_by_user_id INT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_org_requesting_agency (organization_id, requesting_agency_id),
  INDEX idx_org_status (organization_id, status),
  INDEX idx_requesting_agency_status (requesting_agency_id, status),
  CONSTRAINT fk_oar_organization FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_oar_requesting_agency FOREIGN KEY (requesting_agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
