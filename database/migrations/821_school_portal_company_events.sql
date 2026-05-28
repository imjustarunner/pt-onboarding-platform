-- Migration 821: School portal events (Back to School + Spring) on company_events

ALTER TABLE company_events
  ADD COLUMN outreach_table_invited TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'ITSCO invited to attend via outreach table at this school event'
    AFTER staffing_config_json,
  ADD COLUMN flier_file_url VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'Optional PDF or image flier uploaded by school staff'
    AFTER outreach_table_invited;

CREATE TABLE IF NOT EXISTS school_event_post_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  event_category ENUM('back_to_school', 'spring') NOT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  company_event_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_event_post_token (token),
  INDEX idx_school_event_post_tokens_org (school_organization_id, event_category),
  INDEX idx_school_event_post_tokens_agency (agency_id),
  CONSTRAINT fk_school_event_post_tokens_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_event_post_tokens_org
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_event_post_tokens_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_event_post_tokens_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
