-- Migration 1211: Track outreach contact/note/activity source for staff sync and historical import

ALTER TABLE outreach_school_contacts
  ADD COLUMN source VARCHAR(64) NULL
  COMMENT 'school_staff_sync, historical_import, manual',
  ADD COLUMN source_user_id INT NULL
  COMMENT 'Linked school_staff user when synced from the app';

ALTER TABLE outreach_school_notes
  ADD COLUMN source VARCHAR(64) NULL
  COMMENT 'historical_import, manual';

ALTER TABLE outreach_activities
  ADD COLUMN source VARCHAR(64) NULL
  COMMENT 'historical_import, trip, manual';
