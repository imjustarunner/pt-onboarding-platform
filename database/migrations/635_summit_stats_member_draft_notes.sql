-- Summit Stats Team Challenge: manager draft notes for captain draft report

CREATE TABLE IF NOT EXISTS challenge_member_draft_notes (
  id INT NOT NULL AUTO_INCREMENT,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  note_text TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_member_draft_note (learning_class_id, provider_user_id),
  INDEX idx_member_draft_note_class (learning_class_id),
  CONSTRAINT fk_member_draft_note_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_draft_note_user
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
);
