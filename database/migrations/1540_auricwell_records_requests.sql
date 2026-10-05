-- AuricWell records workflow uses the existing agency and staff identities.
CREATE TABLE IF NOT EXISTS auricwell_records_settings (
  agency_id INT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  follow_up_days INT NOT NULL DEFAULT 7,
  revision INT NOT NULL DEFAULT 1,
  FOREIGN KEY (agency_id) REFERENCES agencies(id)
);
CREATE TABLE IF NOT EXISTS auricwell_records_managers (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  assignment_order INT NOT NULL,
  PRIMARY KEY (agency_id,user_id),
  UNIQUE KEY aw_records_manager_order (agency_id,assignment_order),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS auricwell_record_requests (
  id CHAR(36) PRIMARY KEY,
  agency_id INT NOT NULL,
  requester_user_id INT NULL,
  client_id INT NULL,
  assigned_user_id INT NULL,
  status VARCHAR(32) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  support_ticket_id INT NULL,
  follow_up_at DATETIME(3) NOT NULL,
  last_reminded_at DATETIME(3) NULL,
  revision INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  INDEX aw_records_queue (agency_id,status,created_at),
  INDEX aw_records_requester (requester_user_id,agency_id)
);
CREATE TABLE IF NOT EXISTS auricwell_records_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  request_id CHAR(36) NULL,
  actor_user_id INT NULL,
  action VARCHAR(64) NOT NULL,
  details MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX aw_records_audit (agency_id,request_id,created_at)
);
