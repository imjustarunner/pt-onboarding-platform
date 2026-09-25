CREATE TABLE IF NOT EXISTS medical_payer_setup_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payer_name VARCHAR(120) NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_payer_request (agency_id, payer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Owner-requested carrier setup only: no guessed routing IDs or enrollment status.
INSERT IGNORE INTO medical_payer_setup_requests (agency_id,payer_name)
SELECT id,'CO BCBS' FROM agencies WHERE id=377 AND LOWER(name) LIKE '%strength%';
INSERT IGNORE INTO medical_payer_setup_requests (agency_id,payer_name)
SELECT id,'UnitedHealthcare' FROM agencies WHERE id=377 AND LOWER(name) LIKE '%strength%';
