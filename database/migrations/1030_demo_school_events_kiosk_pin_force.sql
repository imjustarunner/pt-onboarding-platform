-- Migration 1030: Set school-events kiosk PIN for Demo ITSCO (/demo/school-events/kiosk)
-- 1029 only updated rows with a NULL pin; this forces 5373 on the demo tenant.

UPDATE agencies
SET
  school_events_kiosk_pin_code = '5373',
  school_events_kiosk_pin_hash = '93919581b9314ddadcfe6395a9d77c3ab8e30bffc0ced00695e9d52f7de1b620'
WHERE LOWER(COALESCE(slug, '')) = 'demo'
   OR LOWER(COALESCE(portal_url, '')) = 'demo'
   OR LOWER(COALESCE(name, '')) LIKE '%demo itsco%';
