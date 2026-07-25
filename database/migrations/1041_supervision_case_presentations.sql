-- Migration 1041: Case presentation decks for group/triadic supervision presenters

CREATE TABLE IF NOT EXISTS supervision_case_presentations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  presenter_user_id INT NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'templated'
    COMMENT 'templated | upload | external_link',
  external_url VARCHAR(2048) NULL,
  storage_path VARCHAR(1024) NULL,
  mime_type VARCHAR(191) NULL,
  original_filename VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft | ready | presented',
  case_summary_json JSON NULL
    COMMENT 'Case at a glance fields for live panel',
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_supervision_presentation_presenter (session_id, presenter_user_id),
  INDEX idx_supervision_presentation_session (session_id),
  INDEX idx_supervision_presentation_presenter (presenter_user_id),
  CONSTRAINT fk_supervision_presentation_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_presentation_presenter
    FOREIGN KEY (presenter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_presentation_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_supervision_presentation_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervision_presentation_slides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  presentation_id BIGINT NOT NULL,
  slide_order INT NOT NULL DEFAULT 0,
  section_key VARCHAR(64) NULL,
  title VARCHAR(255) NULL,
  body_html LONGTEXT NULL,
  presenter_notes LONGTEXT NULL,
  layout VARCHAR(32) NOT NULL DEFAULT 'text'
    COMMENT 'text | text_image | image | title',
  background VARCHAR(64) NULL,
  media_url VARCHAR(1024) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_supervision_slides_order (presentation_id, slide_order),
  CONSTRAINT fk_supervision_slides_presentation
    FOREIGN KEY (presentation_id) REFERENCES supervision_case_presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_slides_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervision_presentation_state (
  session_id INT PRIMARY KEY,
  active_presentation_id BIGINT NULL,
  current_slide_id BIGINT NULL,
  current_slide_order INT NOT NULL DEFAULT 0,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_supervision_pres_state_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_pres_state_presentation
    FOREIGN KEY (active_presentation_id) REFERENCES supervision_case_presentations(id) ON DELETE SET NULL,
  CONSTRAINT fk_supervision_pres_state_slide
    FOREIGN KEY (current_slide_id) REFERENCES supervision_presentation_slides(id) ON DELETE SET NULL,
  CONSTRAINT fk_supervision_pres_state_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
