-- Consolidate Summit Stats Team Challenge platform agency: rename summit-stats to ssc.
-- Run after 567. If you already have an agency with slug 'ssc', run this manually
-- or remove the duplicate first to avoid a unique constraint error.

UPDATE agencies
SET slug = 'ssc', portal_url = 'ssc'
WHERE slug = 'summit-stats';
