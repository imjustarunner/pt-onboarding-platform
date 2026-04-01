CREATE TABLE IF NOT EXISTS company_event_provider_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  role_title VARCHAR(255) NULL DEFAULT NULL,
  role_key VARCHAR(64) NULL DEFAULT NULL,
  is_primary_access TINYINT(1) NOT NULL DEFAULT 0,
  virtual_access_role ENUM('participant', 'presenter', 'co_presenter') NOT NULL DEFAULT 'participant',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_event_provider_assignment (company_event_id, provider_user_id),
  INDEX idx_event_provider_assignments_event (company_event_id),
  INDEX idx_event_provider_assignments_provider (provider_user_id),
  CONSTRAINT fk_event_provider_assignments_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_provider_assignments_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

