-- Migration 1028: Course templates, media library, and learner Saved courses

CREATE TABLE IF NOT EXISTS training_course_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform template',
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(64) NULL COMMENT 'compliance, onboarding, skills, safety, policy',
  format_label VARCHAR(120) NULL COMMENT 'Short pedagogical pattern name',
  estimated_minutes INT NULL,
  lesson_count INT NOT NULL DEFAULT 1,
  payload_json JSON NOT NULL,
  tags_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_slug_agency (slug, agency_id),
  INDEX idx_agency_active (agency_id, is_active),
  CONSTRAINT fk_tct_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tct_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_media_library (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform-shared',
  title VARCHAR(255) NOT NULL,
  media_kind ENUM('video', 'pdf', 'image') NOT NULL,
  mime_type VARCHAR(128) NULL,
  original_filename VARCHAR(255) NULL,
  gcs_path VARCHAR(512) NOT NULL,
  public_url VARCHAR(1024) NULL,
  size_bytes INT UNSIGNED NULL,
  duration_seconds INT NULL,
  source_kind ENUM('upload', 'external_url') NOT NULL DEFAULT 'upload',
  external_url VARCHAR(1024) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agency_kind (agency_id, media_kind),
  CONSTRAINT fk_tml_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tml_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_saved_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_type ENUM('module', 'focus') NOT NULL DEFAULT 'module',
  item_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_saved (user_id, item_type, item_id),
  INDEX idx_user (user_id),
  CONSTRAINT fk_tsc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
