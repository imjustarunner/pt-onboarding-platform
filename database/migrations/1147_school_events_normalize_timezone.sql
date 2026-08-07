-- Migration 1147: Normalize school event timezones to Mountain Time
--
-- School events saved by users in Central or Eastern time were stored with the
-- wrong timezone label. The UTC instants are preserved; only the timezone
-- metadata (used for display on the kiosk, portal banner, and admin calendar)
-- is updated to America/Denver so all events display in Mountain Time.
--
-- Events already set to America/Denver or America/Phoenix (AZ no-DST) are left
-- unchanged. Pacific, Alaska, and Hawaii events are also corrected since all
-- ITSCO schools are in Colorado (Mountain timezone territory).

UPDATE company_events
SET timezone = 'America/Denver'
WHERE event_type LIKE 'school\_%'
  AND timezone NOT IN ('America/Denver', 'America/Phoenix')
  AND timezone IS NOT NULL
  AND timezone != '';
