-- Migration 1214: map ITSCO to app.itsco.health so emails and host resolve use the dedicated app login
UPDATE agencies
SET custom_domain = 'app.itsco.health'
WHERE slug = 'itsco'
  AND (custom_domain IS NULL OR TRIM(custom_domain) = '');

INSERT IGNORE INTO agency_custom_domains (agency_id, hostname, is_active)
SELECT id, 'app.itsco.health', TRUE
FROM agencies
WHERE slug = 'itsco'
LIMIT 1;
