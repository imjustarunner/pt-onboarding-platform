-- Migration: Add custom domain mapping for agency portals
-- Description: Allow mapping a full hostname (e.g., "app.agency2.com") to an agency/org for branded login.

-- IMPORTANT:
-- The agencies table in this project can hit MySQL's per-table index limit (64 keys).
-- Do NOT add new indexes to agencies for custom domains.
-- Instead, store hostname mappings in a separate table with its own unique index.

-- Best-effort: add a nullable column for legacy/debugging (no indexes).
-- Some environments may already have this column from a partially-run migration.
SET @has_custom_domain_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agencies'
    AND COLUMN_NAME = 'custom_domain'
);
SET @sql_add_custom_domain :=
  IF(@has_custom_domain_col = 0,
    "ALTER TABLE agencies ADD COLUMN custom_domain VARCHAR(255) NULL COMMENT 'Custom domain hostname for portal access (e.g., \"app.agency2.com\")' AFTER portal_url",
    "SELECT 1"
  );
PREPARE stmt FROM @sql_add_custom_domain;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Canonical mapping table (one hostname -> one org)
CREATE TABLE IF NOT EXISTS agency_custom_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agency_custom_domains_agency_id
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_agency_custom_domains_hostname (hostname),
  INDEX idx_agency_custom_domains_agency_id (agency_id),
  INDEX idx_agency_custom_domains_active (is_active)
);

-- Backfill from agencies.custom_domain if present (best-effort).
INSERT IGNORE INTO agency_custom_domains (agency_id, hostname, is_active)
SELECT id, LOWER(TRIM(custom_domain)), TRUE
FROM agencies
WHERE custom_domain IS NOT NULL AND TRIM(custom_domain) <> '';

