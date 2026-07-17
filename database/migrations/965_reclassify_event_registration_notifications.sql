-- Historical notification creation used status_expired as a fallback type for
-- otherwise valid producers. Reclassify only the unambiguous company-event
-- registration records; preserve their IDs and all per-viewer state.

UPDATE notifications
SET type = 'company_event_registration_submitted'
WHERE type = 'status_expired'
  AND title = 'New event registration'
  AND related_entity_type = 'company_event';
