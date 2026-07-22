-- Migration 1029: Default school-events kiosk PIN (5373) for ITSCO and Demo ITSCO
-- Demo ITSCO kiosk URL: /demo/school-events/kiosk (agency slug or portal_url = demo)
-- Production ITSCO kiosk URL: /itsco/school-events/kiosk
-- Same station PIN (5373) as other ITSCO kiosks. Only sets where not already configured.

UPDATE agencies
SET
  school_events_kiosk_pin_code = '5373',
  school_events_kiosk_pin_hash = '93919581b9314ddadcfe6395a9d77c3ab8e30bffc0ced00695e9d52f7de1b620'
WHERE school_events_kiosk_pin_hash IS NULL
  AND (
    LOWER(COALESCE(slug, '')) IN ('demo', 'itsco', 'itsco-demo')
    OR LOWER(COALESCE(portal_url, '')) IN ('demo', 'itsco', 'itsco-demo')
    OR LOWER(COALESCE(name, '')) LIKE '%demo itsco%'
  );
