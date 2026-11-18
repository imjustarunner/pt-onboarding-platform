-- One record per actual presentation, with idempotent completion timestamps.
-- A login hash is a correlation key only. No authentication credentials are stored.
CREATE TABLE IF NOT EXISTS company_event_splash_views (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  login_key CHAR(64) NOT NULL,
  item_key VARCHAR(160) NOT NULL,
  display_id CHAR(36) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  dismissed_at DATETIME(3) NULL,
  opened_at DATETIME(3) NULL,
  responded_at DATETIME(3) NULL,
  UNIQUE KEY uq_event_splash_display (user_id, display_id),
  KEY idx_event_splash_login (user_id, login_key),
  KEY idx_event_splash_history (company_event_id, user_id, viewed_at),
  CONSTRAINT fk_event_splash_event FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_splash_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only audit for narrowly scoped, user-authorized repair mail.
-- recipient_user_id identifies the recipient, never the automation actor.
CREATE TABLE IF NOT EXISTS company_event_automation_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  operation_key VARCHAR(100) NOT NULL,
  automation_actor VARCHAR(120) NOT NULL,
  cloud_principal VARCHAR(255) NOT NULL,
  company_event_id INT NOT NULL,
  recipient_user_id INT NOT NULL,
  phase VARCHAR(24) NOT NULL,
  details_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_event_automation_phase (operation_key,company_event_id,recipient_user_id,phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
