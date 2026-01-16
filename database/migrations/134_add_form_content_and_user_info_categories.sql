-- Migration: Add 'form' module content + user info categories
-- Description:
-- 1) Extend module_content.content_type enum with 'form' for Custom Input Modules
-- 2) Add user_info_categories (platform + agency)
-- 3) Add category_key to user_info_field_definitions for grouping fields into profile tabs/sections

-- 1) Module content type: 'form'
ALTER TABLE module_content
MODIFY COLUMN content_type ENUM('video', 'slide', 'quiz', 'acknowledgment', 'text', 'form') NOT NULL;

-- 2) Categories table
CREATE TABLE IF NOT EXISTS user_info_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(100) NOT NULL,
  category_label VARCHAR(255) NOT NULL,
  is_platform_template BOOLEAN DEFAULT FALSE,
  agency_id INT NULL,
  order_index INT DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_agency_category_key (agency_id, category_key),
  INDEX idx_agency_id (agency_id),
  INDEX idx_is_platform_template (is_platform_template),
  INDEX idx_category_key (category_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Field definitions link to categories by key (no FK to keep null-safe + simple)
ALTER TABLE user_info_field_definitions
ADD COLUMN category_key VARCHAR(100) NULL AFTER parent_field_id,
ADD INDEX idx_category_key (category_key);

