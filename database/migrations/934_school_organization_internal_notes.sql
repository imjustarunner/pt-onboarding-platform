-- Migration 934: school organization internal notes (admin/CPA only)
-- Append-only internal notes per school org, not visible to school staff or providers.

CREATE TABLE IF NOT EXISTS school_organization_internal_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  author_user_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_org_internal_notes_school (school_organization_id),
  INDEX idx_school_org_internal_notes_author (author_user_id),
  INDEX idx_school_org_internal_notes_created (created_at),
  CONSTRAINT fk_school_org_internal_notes_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_org_internal_notes_author
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
