-- AI translation cache. One row per (source_type, source_id, source_field, language_code).
-- source_hash is the MD5 of the original English text — if the source changes,
-- we compare hashes and regenerate the translation on first request.

CREATE TABLE IF NOT EXISTS translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(60) NOT NULL,
  source_id INT NOT NULL,
  source_field VARCHAR(100) NOT NULL,
  source_hash CHAR(32) NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'es',
  translated_text MEDIUMTEXT NOT NULL,
  translation_engine VARCHAR(40) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_translation (source_type, source_id, source_field, language_code),
  INDEX idx_translations_lookup (source_type, language_code, source_id)
);
