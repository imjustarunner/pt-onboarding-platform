-- Migration 1200: default Admin Update email to click-through (link) instead of full HTML
ALTER TABLE admin_updates
  MODIFY COLUMN delivery_mode VARCHAR(16) NOT NULL DEFAULT 'link' COMMENT 'html, link';
