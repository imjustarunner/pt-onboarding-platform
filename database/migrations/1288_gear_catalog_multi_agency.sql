-- Migration 1288: Gear catalog (multi-agency), photos, responsible owners, materials/manual-low, movement types
-- Idempotent: safe to re-run after a partial apply.

CREATE TABLE IF NOT EXISTS gear_catalog_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  sku VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  unit VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Each',
  category VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gear'
    COMMENT 'gear | equipment | materials | promotional | outreach',
  stock_mode ENUM('COUNTED', 'MANUAL_LOW') NOT NULL DEFAULT 'COUNTED',
  tracking_mode ENUM('SIZED_STOCK', 'UNIQUE_ASSET', 'NONE') NOT NULL DEFAULT 'SIZED_STOCK',
  size_options_json JSON NULL,
  is_gendered TINYINT(1) NOT NULL DEFAULT 0,
  lifecycle_item_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  default_low_stock_threshold INT NOT NULL DEFAULT 2,
  allow_manual_low TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gear_catalog_active_cat (is_active, category),
  INDEX idx_gear_catalog_name (name),
  CONSTRAINT fk_gear_catalog_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gear_catalog_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalog_item_id INT NOT NULL,
  file_path VARCHAR(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gear_catalog_images_item (catalog_item_id, sort_order),
  CONSTRAINT fk_gear_catalog_images_item FOREIGN KEY (catalog_item_id) REFERENCES gear_catalog_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gear_catalog_agency (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalog_item_id INT NOT NULL,
  agency_id INT NOT NULL,
  gear_item_type_id INT NULL COMMENT 'Per-agency type row used for stock/assets/assignments',
  responsible_user_id INT NULL,
  manual_is_low TINYINT(1) NOT NULL DEFAULT 0,
  low_stock_threshold INT NULL COMMENT 'NULL = use catalog default',
  last_low_alert_at TIMESTAMP NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gear_catalog_agency (catalog_item_id, agency_id),
  INDEX idx_gear_catalog_agency_agency (agency_id, is_active),
  INDEX idx_gear_catalog_agency_owner (responsible_user_id),
  CONSTRAINT fk_gca_catalog FOREIGN KEY (catalog_item_id) REFERENCES gear_catalog_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_gca_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gca_type FOREIGN KEY (gear_item_type_id) REFERENCES gear_item_types(id) ON DELETE SET NULL,
  CONSTRAINT fk_gca_responsible FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gear_item_types'
    AND COLUMN_NAME = 'catalog_item_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE gear_item_types ADD COLUMN catalog_item_id INT NULL DEFAULT NULL COMMENT ''Shared multi-agency catalog item this type belongs to'' AFTER agency_id, ADD INDEX idx_gear_types_catalog (catalog_item_id), ADD CONSTRAINT fk_gear_types_catalog FOREIGN KEY (catalog_item_id) REFERENCES gear_catalog_items(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @dest_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'gear_stock_movements'
    AND COLUMN_NAME = 'destination_label'
);
SET @sql := IF(@dest_exists = 0,
  'ALTER TABLE gear_stock_movements MODIFY COLUMN movement_type ENUM(''ISSUE'',''RETURN'',''ADJUST'',''CREATE_ASSET'',''RETIRE_ASSET'',''SENT'',''MARK_LOW'',''CLEAR_LOW'',''REORDER_ALERT'') NOT NULL, ADD COLUMN destination_label VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT ''Event / destination for SENT activity'' AFTER reason, ADD COLUMN activity_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT ''issued_to_person | sent_to_event | etc.'' AFTER destination_label',
  'ALTER TABLE gear_stock_movements MODIFY COLUMN movement_type ENUM(''ISSUE'',''RETURN'',''ADJUST'',''CREATE_ASSET'',''RETIRE_ASSET'',''SENT'',''MARK_LOW'',''CLEAR_LOW'',''REORDER_ALERT'') NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: one shared catalog item per distinct type name (collation-safe)
INSERT INTO gear_catalog_items (
  name, category, stock_mode, tracking_mode, size_options_json, is_gendered,
  lifecycle_item_key, default_low_stock_threshold, allow_manual_low, is_active
)
SELECT
  t.name,
  CASE
    WHEN LOWER(CONVERT(t.category USING utf8mb4) COLLATE utf8mb4_unicode_ci) IN ('materials', 'promotional', 'outreach')
      THEN LOWER(CONVERT(t.category USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    WHEN LOWER(CONVERT(t.category USING utf8mb4) COLLATE utf8mb4_unicode_ci) IN ('electronics', 'keys_access', 'vehicle')
      THEN 'equipment'
    WHEN LOWER(CONVERT(t.category USING utf8mb4) COLLATE utf8mb4_unicode_ci) = 'apparel'
      THEN 'gear'
    ELSE 'gear'
  END,
  'COUNTED',
  CASE WHEN t.tracking_mode = 'UNIQUE_ASSET' THEN 'UNIQUE_ASSET' ELSE 'SIZED_STOCK' END,
  t.size_options_json,
  COALESCE(t.is_gendered, 0),
  t.lifecycle_item_key,
  t.low_stock_threshold,
  1,
  1
FROM gear_item_types t
INNER JOIN (
  SELECT MIN(id) AS id
  FROM gear_item_types
  GROUP BY LOWER(TRIM(CONVERT(name USING utf8mb4) COLLATE utf8mb4_unicode_ci))
) first_of_name ON first_of_name.id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM gear_catalog_items c
  WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(CONVERT(t.name USING utf8mb4) COLLATE utf8mb4_unicode_ci))
);

UPDATE gear_item_types t
INNER JOIN gear_catalog_items c
  ON LOWER(TRIM(CONVERT(t.name USING utf8mb4) COLLATE utf8mb4_unicode_ci)) = LOWER(TRIM(c.name))
SET t.catalog_item_id = c.id
WHERE t.catalog_item_id IS NULL;

INSERT INTO gear_catalog_agency (catalog_item_id, agency_id, gear_item_type_id, low_stock_threshold, is_active)
SELECT
  t.catalog_item_id,
  t.agency_id,
  t.id,
  t.low_stock_threshold,
  t.is_active
FROM gear_item_types t
WHERE t.catalog_item_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  gear_item_type_id = COALESCE(gear_catalog_agency.gear_item_type_id, VALUES(gear_item_type_id)),
  is_active = GREATEST(gear_catalog_agency.is_active, VALUES(is_active));

INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to, is_active
)
SELECT
  e.agency_id,
  'materials',
  CONCAT(COALESCE(a.name, 'Agency'), ' Materials'),
  CONCAT('materials@', SUBSTRING_INDEX(LOWER(CONVERT(e.from_email USING utf8mb4) COLLATE utf8mb4_unicode_ci), '@', -1)),
  CONCAT('materials@', SUBSTRING_INDEX(LOWER(CONVERT(e.from_email USING utf8mb4) COLLATE utf8mb4_unicode_ci), '@', -1)),
  1
FROM email_sender_identities e
JOIN agencies a ON a.id = e.agency_id
WHERE e.agency_id IS NOT NULL
  AND e.is_active = 1
  AND LOWER(CONVERT(e.from_email USING utf8mb4) COLLATE utf8mb4_unicode_ci) LIKE 'notifications@%'
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities m
    WHERE m.agency_id = e.agency_id
      AND LOWER(CONVERT(m.identity_key USING utf8mb4) COLLATE utf8mb4_unicode_ci) = 'materials'
  );
