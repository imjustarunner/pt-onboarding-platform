-- Migration 1051: per-user encrypted personal supervision notes (visible only to author)
CREATE TABLE supervision_session_personal_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  note_text LONGTEXT NULL COMMENT 'Plaintext fallback when encryption is not configured',
  note_ciphertext LONGTEXT NULL,
  note_iv VARCHAR(64) NULL,
  note_auth_tag VARCHAR(64) NULL,
  encryption_key_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_supervision_personal_note_session_user (session_id, user_id),
  INDEX idx_supervision_personal_note_user (user_id),
  CONSTRAINT fk_supervision_personal_note_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_personal_note_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
