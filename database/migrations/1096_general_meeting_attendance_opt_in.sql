-- Migration 1096: opt-in attendance/transcript tracking for general team meetings
-- Admin meetings, town halls, and huddles always track; general meetings default off.

ALTER TABLE provider_schedule_events
  ADD COLUMN attendance_tracking_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when live attendance + transcript tracking is enabled (general meetings opt-in; always on for admin/town_hall/huddle)';

UPDATE provider_schedule_events
SET attendance_tracking_enabled = 1
WHERE UPPER(COALESCE(kind, '')) = 'HUDDLE'
   OR LOWER(COALESCE(meeting_subtype, 'general')) IN ('admin', 'town_hall');
