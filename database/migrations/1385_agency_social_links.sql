-- Migration 1385: Tenant social profile links for signatures + public website
-- Each platform URL can be shared on staff HTML signatures, the website, both, or neither.

CREATE TABLE agency_social_links (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  platform VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'facebook|twitter|instagram|youtube|linkedin',
  url VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  label VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  show_on_signature TINYINT(1) NOT NULL DEFAULT 1,
  show_on_website TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_social_platform (agency_id, platform),
  KEY idx_agency_social_agency (agency_id),
  CONSTRAINT fk_agency_social_links_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE agency_email_settings
  ADD COLUMN signature_tagline VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Optional motto/tagline under staff HTML signatures';

-- PlotTwistCo (agency_id = 1)
INSERT INTO agency_social_links (agency_id, platform, url, label, show_on_signature, show_on_website, sort_order, is_active)
VALUES
  (1, 'twitter', 'https://twitter.com/PlotTwist_Co', 'X / Twitter', 1, 1, 10, 1),
  (1, 'youtube', 'https://www.youtube.com/@plottwistco', 'YouTube', 1, 1, 20, 1),
  (1, 'instagram', 'https://www.instagram.com/plottwist_co/', 'Instagram', 1, 1, 30, 1),
  (1, 'facebook', 'https://www.facebook.com/PlotTwistCorp', 'Facebook', 1, 1, 40, 1),
  (1, 'linkedin', 'https://www.linkedin.com/company/plottwistco', 'LinkedIn', 1, 1, 50, 1)
ON DUPLICATE KEY UPDATE
  url = VALUES(url),
  label = VALUES(label),
  updated_at = CURRENT_TIMESTAMP;

-- ITSCO (agency_id = 2)
INSERT INTO agency_social_links (agency_id, platform, url, label, show_on_signature, show_on_website, sort_order, is_active)
VALUES
  (2, 'facebook', 'https://www.facebook.com/ITSCounselors', 'Facebook', 1, 1, 10, 1),
  (2, 'twitter', 'https://twitter.com/ITSCOUNSELORS', 'X / Twitter', 1, 1, 20, 1),
  (2, 'instagram', 'https://www.instagram.com/itscounselors/', 'Instagram', 1, 1, 30, 1),
  (2, 'youtube', 'https://www.youtube.com/@itscounselors', 'YouTube', 1, 1, 40, 1),
  (2, 'linkedin', 'https://www.linkedin.com/company/itscounselors', 'LinkedIn', 1, 1, 50, 1)
ON DUPLICATE KEY UPDATE
  url = VALUES(url),
  label = VALUES(label),
  updated_at = CURRENT_TIMESTAMP;

-- Next Level Up (agency_id = 6)
INSERT INTO agency_social_links (agency_id, platform, url, label, show_on_signature, show_on_website, sort_order, is_active)
VALUES
  (6, 'facebook', 'https://www.facebook.com/nextleveluplcc', 'Facebook', 1, 1, 10, 1),
  (6, 'twitter', 'https://twitter.com/nextleveluplcc', 'X / Twitter', 1, 1, 20, 1),
  (6, 'instagram', 'https://www.instagram.com/nextleveluplcc/', 'Instagram', 1, 1, 30, 1),
  (6, 'youtube', 'https://www.youtube.com/@nextleveluplcc', 'YouTube', 1, 1, 40, 1),
  (6, 'linkedin', 'https://www.linkedin.com/company/nextleveluplcc/', 'LinkedIn', 1, 1, 50, 1)
ON DUPLICATE KEY UPDATE
  url = VALUES(url),
  label = VALUES(label),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO agency_email_settings (agency_id, notifications_enabled, signature_tagline)
SELECT 6, 1, 'I cannot be broken, I can only be sharpened and inspired.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM agency_email_settings WHERE agency_id = 6);

UPDATE agency_email_settings
SET signature_tagline = COALESCE(
  NULLIF(TRIM(signature_tagline), ''),
  'I cannot be broken, I can only be sharpened and inspired.'
)
WHERE agency_id = 6;
