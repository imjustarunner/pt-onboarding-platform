-- Migration 1000: notify_participants for meetings/huddles and supervision
-- When 0: skip calendar invite emails, in-app schedule notify emails, and 5-min join reminder emails.

ALTER TABLE provider_schedule_events
  ADD COLUMN notify_participants TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 0, suppress invite/notify emails and automatic join reminder emails';

ALTER TABLE supervision_sessions
  ADD COLUMN notify_participants TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 0, suppress invite/notify emails and automatic join reminder emails';
