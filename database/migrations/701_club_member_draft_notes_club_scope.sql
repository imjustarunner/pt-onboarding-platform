-- Persist manager draft notes per club (affiliation) so they carry into new seasons.

CREATE TABLE IF NOT EXISTS club_member_draft_notes (
  id INT NOT NULL AUTO_INCREMENT,
  club_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  note_text TEXT NULL,
  updated_by_user_id INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_club_member_draft (club_organization_id, provider_user_id),
  INDEX idx_club_member_draft_club (club_organization_id),
  CONSTRAINT fk_club_member_draft_club FOREIGN KEY (club_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_member_draft_user FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_member_draft_editor FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
