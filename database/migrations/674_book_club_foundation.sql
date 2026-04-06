-- Tenant Book Club foundation

ALTER TABLE agencies
  ADD COLUMN club_kind VARCHAR(40) NULL DEFAULT NULL AFTER organization_type;

ALTER TABLE learning_program_classes
  ADD COLUMN program_kind VARCHAR(40) NOT NULL DEFAULT 'season' AFTER class_code,
  ADD COLUMN book_author VARCHAR(255) NULL AFTER description,
  ADD COLUMN book_cover_url VARCHAR(1024) NULL AFTER book_author,
  ADD COLUMN book_month_label VARCHAR(120) NULL AFTER book_cover_url;

CREATE TABLE IF NOT EXISTS book_club_user_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_agency_id INT NOT NULL,
  user_id INT NOT NULL,
  interest_status ENUM('interested', 'never') NOT NULL DEFAULT 'interested',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL,
  UNIQUE KEY uniq_book_club_user_pref (tenant_agency_id, user_id),
  INDEX idx_book_club_user_pref_status (tenant_agency_id, interest_status),
  CONSTRAINT fk_book_club_user_pref_tenant
    FOREIGN KEY (tenant_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_book_club_user_pref_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_book_club_user_pref_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_club_book_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  response_status ENUM('enrolled', 'skipped') NOT NULL,
  responded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  responded_by_user_id INT NULL,
  UNIQUE KEY uniq_book_club_book_response (learning_class_id, user_id),
  INDEX idx_book_club_book_response_status (learning_class_id, response_status),
  CONSTRAINT fk_book_club_book_response_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_book_club_book_response_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_book_club_book_response_by
    FOREIGN KEY (responded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
