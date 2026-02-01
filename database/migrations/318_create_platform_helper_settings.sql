-- Migration: Create platform_helper_settings
-- Description: Platform-wide helper widget settings (single image used across all orgs)

CREATE TABLE IF NOT EXISTS platform_helper_settings (
  id INT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  image_path VARCHAR(512) NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ensure a single row exists (id=1)
INSERT INTO platform_helper_settings (id, enabled)
VALUES (1, 1)
ON DUPLICATE KEY UPDATE id = id;

