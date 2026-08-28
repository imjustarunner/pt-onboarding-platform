-- Migration 1339: map Next Level Up dedicated host for Quick View / portal resolve
UPDATE agencies
SET custom_domain = 'app.nextleveluplcc.com'
WHERE LOWER(COALESCE(slug, portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
  AND (custom_domain IS NULL OR TRIM(custom_domain) = '' OR custom_domain <> 'app.nextleveluplcc.com');

INSERT IGNORE INTO agency_custom_domains (agency_id, hostname, is_active)
SELECT id, 'app.nextleveluplcc.com', TRUE
FROM agencies
WHERE LOWER(COALESCE(slug, portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
LIMIT 1;
