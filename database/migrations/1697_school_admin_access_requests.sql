CREATE TABLE IF NOT EXISTS school_admin_access_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  requester_user_id INT NOT NULL,
  status ENUM('pending','approved','denied','superseded') NOT NULL DEFAULT 'pending',
  pending_user_id INT GENERATED ALWAYS AS (CASE WHEN status='pending' THEN requester_user_id ELSE NULL END) STORED,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INT NULL,
  reviewed_at TIMESTAMP NULL,
  review_note VARCHAR(500) NULL,
  UNIQUE KEY uq_school_pending_admin (school_organization_id,pending_user_id),
  KEY idx_school_admin_requests (school_organization_id,status),
  CONSTRAINT fk_school_admin_request_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id),
  CONSTRAINT fk_school_admin_request_user FOREIGN KEY (requester_user_id) REFERENCES users(id),
  CONSTRAINT fk_school_admin_request_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
