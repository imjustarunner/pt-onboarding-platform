-- Organization contracts remain separate from patient records and staff hiring tasks.
CREATE TABLE IF NOT EXISTS organization_agreement_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  source_key CHAR(36) NULL,
  payload LONGTEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY org_agreement_source (agency_id,kind,source_key),
  KEY org_agreement_list (agency_id,kind,created_at),
  CONSTRAINT org_agreement_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
);
CREATE TABLE IF NOT EXISTS organization_agreement_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  record_id CHAR(36) NULL,
  actor_user_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  details LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY org_agreement_audit_list (agency_id,record_id,created_at),
  CONSTRAINT org_agreement_audit_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT org_agreement_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
);
