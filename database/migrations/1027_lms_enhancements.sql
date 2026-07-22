-- Migration 1027: LMS enhancements — notes, question banks, content library, module versioning

-- 1) Server-synced learner notes per lesson (module)
CREATE TABLE IF NOT EXISTS training_lesson_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module_id INT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_module_notes (user_id, module_id),
  INDEX idx_module (module_id),
  CONSTRAINT fk_tln_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tln_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Reusable question banks (agency or platform)
CREATE TABLE IF NOT EXISTS quiz_question_banks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform-shared bank',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agency (agency_id),
  CONSTRAINT fk_qqb_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_qqb_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_bank_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('multiple_choice', 'true_false', 'text') NOT NULL DEFAULT 'multiple_choice',
  options_json JSON NULL,
  correct_answer VARCHAR(500) NULL,
  explanation TEXT NULL,
  remediation_html TEXT NULL COMMENT 'Shown after incorrect answer',
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bank (bank_id),
  CONSTRAINT fk_qbq_bank FOREIGN KEY (bank_id) REFERENCES quiz_question_banks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Reusable content library blocks
CREATE TABLE IF NOT EXISTS training_content_library (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform template',
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(64) NOT NULL,
  content_data JSON NOT NULL,
  settings JSON NULL,
  tags_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agency (agency_id),
  INDEX idx_type (content_type),
  CONSTRAINT fk_tcl_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tcl_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Simple publish revision counter on modules
ALTER TABLE modules
  ADD COLUMN version INT NOT NULL DEFAULT 1
  COMMENT 'Incremented each time a draft is published'
  AFTER publish_status;

ALTER TABLE modules
  ADD COLUMN published_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'Last publish timestamp'
  AFTER version;
