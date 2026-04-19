-- Store per-user game progress payloads.
-- This supports tenant-scoped persistence for games served from /games-content/*.

CREATE TABLE IF NOT EXISTS user_game_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  game_key VARCHAR(100) NOT NULL,
  state_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_game_progress_scope (user_id, game_key),
  KEY idx_user_game_progress_game (game_key),
  CONSTRAINT fk_user_game_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
