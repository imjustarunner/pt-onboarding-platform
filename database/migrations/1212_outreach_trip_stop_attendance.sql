-- Migration 1212: Trip stop attendance and return-home mileage

ALTER TABLE outreach_trip_stops
  ADD COLUMN attendance_status VARCHAR(32) NOT NULL DEFAULT 'pending'
  COMMENT 'pending, attended, skipped, time_short',
  ADD COLUMN attendance_notes TEXT NULL
  COMMENT 'Why skipped or short on time',
  ADD COLUMN attended_at DATETIME NULL
  COMMENT 'When the stop was marked attended';
