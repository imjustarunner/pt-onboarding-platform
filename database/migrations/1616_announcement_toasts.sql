-- Toasts share the existing schedule; platform support notices are AuricWell-only.
ALTER TABLE agency_scheduled_announcements
  MODIFY COLUMN display_type ENUM('announcement', 'splash', 'toast') NOT NULL DEFAULT 'announcement',
  MODIFY COLUMN agency_id INT NULL,
  MODIFY COLUMN created_by_user_id INT NULL,
  ADD COLUMN created_by_auricwell_account_id CHAR(36) NULL,
  ADD COLUMN delivery_scope VARCHAR(32) NOT NULL DEFAULT 'agency',
  ADD COLUMN seed_key VARCHAR(128) NULL,
  ADD UNIQUE KEY uq_announcement_seed (agency_id, seed_key),
  ADD INDEX idx_announcement_scope_time (delivery_scope, starts_at, ends_at);
