/*
Attach transcript + summary artifacts to supervision sessions.

This enables:
- transcript link/text stored per supervision session
- Gemini-generated meeting summary stored on the same session artifact
- admin visibility via supervision attendance/log surfaces
*/

CREATE TABLE IF NOT EXISTS supervision_session_artifacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  tagged_at DATETIME NULL,
  transcript_url VARCHAR(2048) NULL,
  transcript_text LONGTEXT NULL,
  summary_text LONGTEXT NULL,
  summary_model VARCHAR(120) NULL,
  summary_generated_at DATETIME NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_session_artifact_session (session_id),
  INDEX idx_supervision_session_artifacts_updated (updated_at),

  CONSTRAINT fk_supervision_session_artifacts_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_session_artifacts_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

