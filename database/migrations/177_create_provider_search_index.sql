-- Provider search index for Provider Onboarding / Provider Info fields.
-- This denormalizes user_info_values into a query-friendly shape for filtering providers.

CREATE TABLE IF NOT EXISTS provider_search_index (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  field_key VARCHAR(191) NOT NULL,
  field_type VARCHAR(32) NOT NULL,
  value_text TEXT NULL,
  value_option VARCHAR(255) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_provider_search_agency_user (agency_id, user_id),
  INDEX idx_provider_search_option (agency_id, field_key, value_option),
  INDEX idx_provider_search_field (agency_id, field_key),
  INDEX idx_provider_search_user (user_id),

  CONSTRAINT fk_provider_search_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_search_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

