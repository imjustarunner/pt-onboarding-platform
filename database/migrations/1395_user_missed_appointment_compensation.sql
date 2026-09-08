-- Migration 1395: Per-user missed-appointment compensation mode for payroll

ALTER TABLE users
  ADD COLUMN missed_appointment_compensation_mode VARCHAR(32) NOT NULL DEFAULT 'none'
  COMMENT 'none|hourly|percent_of_fee'
  AFTER medcancel_rate_schedule;

ALTER TABLE users
  ADD COLUMN missed_appointment_compensation_percent DECIMAL(5,2) NULL DEFAULT NULL
  COMMENT 'When mode=percent_of_fee, e.g. 50.00 for 50% of collected missed-appointment fee'
  AFTER missed_appointment_compensation_mode;
