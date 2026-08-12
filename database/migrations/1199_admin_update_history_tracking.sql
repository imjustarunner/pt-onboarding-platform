-- Migration 1199: Admin Update public tokens, delivery mode, splash, and activity tracking

ALTER TABLE admin_updates
  ADD COLUMN public_token VARCHAR(64) NULL AFTER sender_identity_id,
  ADD COLUMN delivery_mode VARCHAR(16) NOT NULL DEFAULT 'html' COMMENT 'html, link',
  ADD COLUMN push_splash TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN sent_html LONGTEXT NULL;

ALTER TABLE admin_update_sends
  ADD COLUMN view_token VARCHAR(64) NULL AFTER user_id,
  ADD COLUMN open_track_token VARCHAR(64) NULL AFTER view_token,
  ADD COLUMN opened_at DATETIME NULL AFTER sent_at,
  ADD COLUMN viewed_at DATETIME NULL AFTER opened_at;

CREATE UNIQUE INDEX uq_au_public_token ON admin_updates (public_token);
CREATE UNIQUE INDEX uq_aus_view_token ON admin_update_sends (view_token);
CREATE UNIQUE INDEX uq_aus_open_token ON admin_update_sends (open_track_token);

CREATE TABLE admin_update_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  update_id INT NOT NULL,
  send_id INT NULL,
  user_id INT NULL,
  channel VARCHAR(32) NOT NULL COMMENT 'email, public, splash',
  event_type VARCHAR(32) NOT NULL COMMENT 'open, view, click, scroll, dwell, splash_open, splash_dismiss',
  event_key VARCHAR(500) NULL,
  duration_ms INT NULL,
  scroll_pct TINYINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aua_update (update_id, event_type, created_at),
  INDEX idx_aua_user (user_id, update_id),
  CONSTRAINT fk_aua_update FOREIGN KEY (update_id) REFERENCES admin_updates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_update_splashes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  update_id INT NOT NULL,
  user_id INT NOT NULL,
  view_token VARCHAR(64) NOT NULL,
  opened_at DATETIME NULL,
  dismissed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ausplash_update_user (update_id, user_id),
  INDEX idx_ausplash_user (user_id, dismissed_at),
  CONSTRAINT fk_ausplash_update FOREIGN KEY (update_id) REFERENCES admin_updates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
