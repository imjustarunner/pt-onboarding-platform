-- Migration 1069: distinguish additional school hours vs schedule adjustment requests
ALTER TABLE provider_school_availability_requests
  ADD COLUMN request_kind ENUM('additional_hours', 'schedule_adjustment') NOT NULL DEFAULT 'additional_hours'
  COMMENT 'additional_hours or schedule_adjustment'
  AFTER notes;

UPDATE provider_school_availability_requests
SET request_kind = 'schedule_adjustment'
WHERE notes LIKE 'Schedule adjustment request%';
