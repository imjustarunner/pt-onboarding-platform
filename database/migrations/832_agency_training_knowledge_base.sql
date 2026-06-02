-- Migration 832: Agency training knowledge base + AI module generation audit

CREATE TABLE IF NOT EXISTS agency_training_kb_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  folder VARCHAR(64) NOT NULL DEFAULT 'handbook',
  file_name VARCHAR(255) NOT NULL,
  gcs_path VARCHAR(512) NOT NULL,
  content_type VARCHAR(128) NULL,
  size_bytes INT UNSIGNED NULL,
  uploaded_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agency_training_kb_agency (agency_id),
  INDEX idx_agency_training_kb_folder (agency_id, folder),
  CONSTRAINT fk_agency_training_kb_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_training_kb_uploaded_by
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_module_generation_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  module_id INT NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  request_json JSON NULL,
  output_json JSON NULL,
  model VARCHAR(128) NULL,
  provider VARCHAR(64) NULL,
  latency_ms INT NULL,
  error_message TEXT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_training_module_gen_agency (agency_id),
  INDEX idx_training_module_gen_module (module_id),
  CONSTRAINT fk_training_module_gen_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_training_module_gen_module
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
  CONSTRAINT fk_training_module_gen_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
