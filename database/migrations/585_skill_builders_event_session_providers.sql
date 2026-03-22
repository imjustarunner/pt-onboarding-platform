-- Per-session staff: which roster providers are expected on each materialized occurrence.
-- Complements skills_group_providers (group-level roster). Rows cascade when sessions are rebuilt (584).

CREATE TABLE IF NOT EXISTS skill_builders_event_session_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sb_session_provider (session_id, provider_user_id),
  INDEX idx_sb_session_providers_user (provider_user_id),
  CONSTRAINT fk_sb_session_providers_session
    FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_session_providers_user
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
