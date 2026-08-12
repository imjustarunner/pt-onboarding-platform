-- Migration 1197: Admin Update drafts, topics, people, and send queue

CREATE TABLE admin_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  title VARCHAR(180) NOT NULL DEFAULT 'Admin Updates',
  subtitle VARCHAR(255) NULL,
  greeting VARCHAR(180) NULL,
  intro_html TEXT NULL,
  featured_enabled TINYINT(1) NOT NULL DEFAULT 0,
  featured_title VARCHAR(180) NULL,
  featured_body TEXT NULL,
  featured_cta_label VARCHAR(80) NULL,
  featured_cta_url VARCHAR(500) NULL,
  support_enabled TINYINT(1) NOT NULL DEFAULT 1,
  support_title VARCHAR(180) NULL,
  support_body TEXT NULL,
  support_email VARCHAR(255) NULL,
  footer_tagline VARCHAR(255) NULL,
  staffing_since DATE NULL,
  departures_since DATE NULL,
  sender_identity_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft, scheduled, sending, sent, cancelled',
  scheduled_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_au_agency_status (agency_id, status, updated_at),
  INDEX idx_au_scheduled (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_update_topics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  update_id INT NOT NULL,
  topic_key VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  title VARCHAR(180) NOT NULL,
  description VARCHAR(400) NULL,
  icon_key VARCHAR(64) NOT NULL DEFAULT 'spark',
  color VARCHAR(16) NOT NULL DEFAULT '#0f766e',
  sort_order INT NOT NULL DEFAULT 0,
  body_html TEXT NULL,
  is_builtin TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_aut_update (update_id, sort_order),
  CONSTRAINT fk_aut_update FOREIGN KEY (update_id) REFERENCES admin_updates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_update_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  topic_id INT NOT NULL,
  user_id INT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'custom' COMMENT 'hire, departure, custom',
  display_name VARCHAR(180) NULL,
  role_title VARCHAR(180) NULL,
  photo_url VARCHAR(500) NULL,
  item_date DATE NULL,
  status_label VARCHAR(80) NULL,
  body_text TEXT NULL,
  destination VARCHAR(255) NULL,
  tenure_text VARCHAR(80) NULL,
  link_url VARCHAR(500) NULL,
  link_label VARCHAR(80) NULL,
  included TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_aui_topic (topic_id, sort_order),
  CONSTRAINT fk_aui_topic FOREIGN KEY (topic_id) REFERENCES admin_update_topics(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_update_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  update_id INT NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  user_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  INDEX idx_aus_update (update_id, status),
  CONSTRAINT fk_aus_update FOREIGN KEY (update_id) REFERENCES admin_updates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
