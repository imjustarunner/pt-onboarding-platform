-- Migration: Reconcile user info categories + 'form' content type (idempotent)
-- Purpose:
-- - Safe to run if 134 was partially applied or manually re-run
-- - Ensures:
--   1) module_content.content_type includes 'form'
--   2) user_info_categories exists
--   3) user_info_field_definitions.category_key exists
--   4) user_info_field_definitions has idx_category_key

-- 1) Module content type: 'form' (safe to re-run)
ALTER TABLE module_content
MODIFY COLUMN content_type ENUM('video', 'slide', 'quiz', 'acknowledgment', 'text', 'form') NOT NULL;

-- 2) Categories table (safe to re-run)
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

-- 3) Add category_key column only if missing
SET @db := DATABASE();
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'user_info_field_definitions'
    AND COLUMN_NAME = 'category_key'
);
SET @add_col_sql := IF(
  @col_exists = 0,
  'ALTER TABLE user_info_field_definitions ADD COLUMN category_key VARCHAR(100) NULL AFTER parent_field_id',
  'SELECT 1'
);
PREPARE stmt_add_col FROM @add_col_sql;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

-- 4) Add idx_category_key only if missing
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'user_info_field_definitions'
    AND INDEX_NAME = 'idx_category_key'
);
SET @add_idx_sql := IF(
  @idx_exists = 0,
  'ALTER TABLE user_info_field_definitions ADD INDEX idx_category_key (category_key)',
  'SELECT 1'
);
PREPARE stmt_add_idx FROM @add_idx_sql;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;

