-- Migration 1765: staff client alerts and per-person dismissal
-- Referral comments written at assignment or from the client messages window.
-- Dismissal is per viewer. The alert remains for everyone else.

CREATE TABLE IF NOT EXISTS client_alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_by_user_id INT NOT NULL,
  assignment_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_client_alerts_client (client_id, id),
  KEY idx_client_alerts_assignment (assignment_id),
  CONSTRAINT fk_client_alerts_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_alerts_author FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_client_alerts_assignment FOREIGN KEY (assignment_id) REFERENCES client_provider_assignments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_alert_dismissals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  alert_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_alert_dismissal (alert_id, user_id),
  KEY idx_client_alert_dismissal_user (user_id, alert_id),
  CONSTRAINT fk_client_alert_dismissal_alert FOREIGN KEY (alert_id) REFERENCES client_alerts(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_alert_dismissal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
