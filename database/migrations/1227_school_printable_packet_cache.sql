-- Migration 1227: cache rendered school paper packets so View/Print/Download
-- serve a stored PDF instead of launching Chromium on every click.
CREATE TABLE school_printable_packet_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  content_hash CHAR(64) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  byte_size INT NULL,
  generated_at DATETIME NOT NULL,
  UNIQUE KEY uq_school_printable_packet_cache_school_locale (school_organization_id, locale),
  KEY idx_school_printable_packet_cache_hash (content_hash)
);
