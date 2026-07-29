-- Migration 1094: Enable medical billing stack for ITSCO (chart notes on imported encounters)

UPDATE agencies
SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.medicalBillingEnabled', true)
WHERE LOWER(COALESCE(slug, '')) IN ('itsco', 'itsco-demo', 'demo')
   OR LOWER(COALESCE(portal_url, '')) IN ('itsco', 'itsco-demo', 'demo')
   OR LOWER(COALESCE(name, '')) LIKE '%itsco%';
