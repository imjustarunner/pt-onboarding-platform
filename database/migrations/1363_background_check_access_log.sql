-- Migration 1363: audited access log for encrypted background-check authorizations
-- Full SSN/DL stay in ciphertext; this table records who viewed the decrypted values.

CREATE TABLE hiring_background_check_access_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  viewer_user_id INT NOT NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  INDEX idx_bgcheck_access_user (user_id, viewed_at),
  INDEX idx_bgcheck_access_agency (agency_id, viewed_at),
  INDEX idx_bgcheck_access_viewer (viewer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
