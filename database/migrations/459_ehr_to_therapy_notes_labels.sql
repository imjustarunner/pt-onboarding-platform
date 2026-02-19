/*
Migration: Rename EHR external calendar labels to Therapy Notes
Purpose:
  - All external calendars (ICS feeds from Therapy Notes) should display as "Therapy Notes"
  - Updates existing records: "EHR", "Legacy EHR (ICS)" -> "Therapy Notes"
  - Handles users who may have both labels (merge feeds into Legacy, then rename)
*/

-- Step 1: When user has both "EHR" and "Legacy EHR (ICS)", merge EHR feeds into Legacy, then delete EHR row
INSERT INTO user_external_calendar_feeds (calendar_id, ics_url, is_active, created_at, updated_at)
SELECT leg.id, f.ics_url, f.is_active, f.created_at, f.updated_at
FROM user_external_calendars ehr
JOIN user_external_calendars leg ON leg.user_id = ehr.user_id AND leg.label = 'Legacy EHR (ICS)'
JOIN user_external_calendar_feeds f ON f.calendar_id = ehr.id
WHERE ehr.label = 'EHR'
  AND NOT EXISTS (
    SELECT 1 FROM user_external_calendar_feeds f2
    WHERE f2.calendar_id = leg.id AND f2.ics_url = f.ics_url
  );

DELETE c FROM user_external_calendars c
WHERE c.label = 'EHR'
  AND EXISTS (
    SELECT 1 FROM user_external_calendars leg
    WHERE leg.user_id = c.user_id AND leg.label = 'Legacy EHR (ICS)'
  );

-- Step 2: Rename "Legacy EHR (ICS)" to "Therapy Notes"
UPDATE user_external_calendars SET label = 'Therapy Notes' WHERE label = 'Legacy EHR (ICS)';

-- Step 3: Rename remaining "EHR" to "Therapy Notes"
UPDATE user_external_calendars SET label = 'Therapy Notes' WHERE label = 'EHR';
