-- Add optional recurring booking occurrence cap for office booking plans.
-- When populated, materialization books only the first N matching occurrences from booking_start_date.

ALTER TABLE office_booking_plans
  ADD COLUMN booked_occurrence_count INT NULL AFTER active_until_date;

CREATE INDEX idx_office_booking_plans_occurrence_count
  ON office_booking_plans (booked_occurrence_count);
