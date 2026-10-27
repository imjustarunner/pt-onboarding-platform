-- Separate each occurrence and reminder stage while retaining prior send claims.
ALTER TABLE company_event_checkin_reminders
  ADD COLUMN reminder_type VARCHAR(32) NOT NULL DEFAULT 'checkin',
  ADD COLUMN occurrence_start DATETIME NULL;

UPDATE company_event_checkin_reminders r
JOIN company_events e ON e.id = r.company_event_id
LEFT JOIN (
  SELECT company_event_id, session_date, MIN(starts_at) starts_at
  FROM company_event_session_dates GROUP BY company_event_id, session_date
) sd ON sd.company_event_id = r.company_event_id AND sd.session_date = r.event_date
SET r.occurrence_start = COALESCE(sd.starts_at, e.starts_at);

ALTER TABLE company_event_checkin_reminders
  MODIFY COLUMN occurrence_start DATETIME NOT NULL,
  DROP INDEX uq_event_checkin_reminder,
  ADD UNIQUE KEY uq_event_checkin_reminder
    (company_event_id, user_id, occurrence_start, reminder_type, channel);
