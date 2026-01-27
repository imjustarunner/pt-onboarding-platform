-- Migration: Create hiring tables
-- Description: Support internal applicant/prospective collaboration (profiles, notes, research reports).

CREATE TABLE IF NOT EXISTS hiring_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_user_id INT NOT NULL,
  stage VARCHAR(40) NOT NULL DEFAULT 'applied',
  applied_role VARCHAR(120) NULL,
  source VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_profiles_candidate_user_id (candidate_user_id),
  INDEX idx_hiring_profiles_stage (stage),
  INDEX idx_hiring_profiles_created_at (created_at),
  CONSTRAINT fk_hiring_profiles_candidate_user_id
    FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_user_id INT NOT NULL,
  author_user_id INT NOT NULL,
  message MEDIUMTEXT NOT NULL,
  rating TINYINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hiring_notes_candidate_user_id (candidate_user_id),
  INDEX idx_hiring_notes_author_user_id (author_user_id),
  INDEX idx_hiring_notes_created_at (created_at),
  CONSTRAINT fk_hiring_notes_candidate_user_id
    FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hiring_notes_author_user_id
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_research_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_user_id INT NOT NULL,
  status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  report_text LONGTEXT NULL,
  report_json JSON NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hiring_research_candidate_user_id (candidate_user_id),
  INDEX idx_hiring_research_status (status),
  INDEX idx_hiring_research_created_at (created_at),
  CONSTRAINT fk_hiring_research_candidate_user_id
    FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_hiring_research_created_by_user_id
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

