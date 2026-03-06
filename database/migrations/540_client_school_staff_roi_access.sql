CREATE TABLE IF NOT EXISTS client_school_staff_roi_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  school_staff_user_id INT NOT NULL,
  access_level ENUM('packet', 'roi') NOT NULL DEFAULT 'packet',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by_user_id INT NULL,
  granted_at TIMESTAMP NULL,
  revoked_by_user_id INT NULL,
  revoked_at TIMESTAMP NULL,
  last_packet_uploaded_by_user_id INT NULL,
  last_packet_uploaded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_client_school_staff_roi_access (client_id, school_organization_id, school_staff_user_id),
  INDEX idx_client_school_roi_client (client_id, school_organization_id, is_active),
  INDEX idx_client_school_roi_user (school_staff_user_id, school_organization_id, is_active),
  CONSTRAINT fk_client_school_roi_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_school_roi_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_school_roi_user
    FOREIGN KEY (school_staff_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_school_roi_granted_by
    FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_client_school_roi_revoked_by
    FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_client_school_roi_packet_uploader
    FOREIGN KEY (last_packet_uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
