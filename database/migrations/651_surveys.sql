CREATE TABLE IF NOT EXISTS surveys (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  is_scored TINYINT(1) NOT NULL DEFAULT 0,
  push_type ENUM('providers', 'all_staff', 'school_staff', 'all') NULL DEFAULT NULL,
  questions_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_surveys_agency (agency_id),
  INDEX idx_surveys_active (is_active),
  CONSTRAINT fk_surveys_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_surveys_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
