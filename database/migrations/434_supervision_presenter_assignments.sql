/*
Presenter assignment tracking for group/triadic supervision sessions.
*/

CREATE TABLE IF NOT EXISTS supervision_session_presenters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  presenter_role VARCHAR(32) NOT NULL DEFAULT 'primary', /* primary | secondary */
  status VARCHAR(32) NOT NULL DEFAULT 'assigned',        /* assigned | confirmed | presented | missed */
  topic_summary VARCHAR(500) NULL,
  assigned_by_user_id INT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  presented_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_presenter (session_id, user_id),
  INDEX idx_supervision_presenter_session (session_id, presenter_role),
  INDEX idx_supervision_presenter_user (user_id, status),

  CONSTRAINT fk_supervision_presenter_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_presenter_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_presenter_assigned_by
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
