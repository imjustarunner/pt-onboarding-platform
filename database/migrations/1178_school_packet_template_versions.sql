-- Migration 1178: archive every school packet template save as an immutable version row

CREATE TABLE IF NOT EXISTS school_packet_template_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  version INT NOT NULL,
  html_content LONGTEXT NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_packet_template_version (agency_id, locale, version),
  KEY idx_school_packet_template_versions_agency (agency_id, locale, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed archive from current live templates (best-effort snapshot of current state)
INSERT INTO school_packet_template_versions (agency_id, locale, version, html_content, created_by_user_id, created_at)
SELECT
  t.agency_id,
  COALESCE(NULLIF(TRIM(t.locale), ''), 'en') AS locale,
  COALESCE(t.version, 1) AS version,
  t.html_content,
  t.updated_by_user_id,
  COALESCE(t.updated_at, t.created_at, CURRENT_TIMESTAMP)
FROM school_packet_templates t
WHERE t.html_content IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_packet_template_versions v
    WHERE v.agency_id = t.agency_id
      AND v.locale = COALESCE(NULLIF(TRIM(t.locale), ''), 'en')
      AND v.version = COALESCE(t.version, 1)
  );
