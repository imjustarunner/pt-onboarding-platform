-- Migration 1070: support every-3-weeks / every-4-weeks / monthly same-day on office frequencies
-- Standing assignment + booking plan ENUMs previously only allowed WEEKLY/BIWEEKLY(/MONTHLY).

ALTER TABLE office_standing_assignments
  MODIFY COLUMN assigned_frequency
    ENUM('WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY') NOT NULL;

ALTER TABLE office_booking_plans
  MODIFY COLUMN booked_frequency
    ENUM('WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY') NOT NULL;

-- Schedule + supervision recurrence_frequency is already VARCHAR(16); widen slightly for clarity.
ALTER TABLE provider_schedule_events
  MODIFY COLUMN recurrence_frequency VARCHAR(32) NULL;

ALTER TABLE supervision_sessions
  MODIFY COLUMN recurrence_frequency VARCHAR(32) NULL DEFAULT NULL;
