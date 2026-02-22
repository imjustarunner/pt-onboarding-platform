-- Persist recurrence anchor date for office availability requests.
-- Used to render pending request badges on exact occurrence dates.

ALTER TABLE provider_office_availability_requests
  ADD COLUMN requested_start_date DATE NULL AFTER requested_occurrence_count;

-- Backfill existing rows to their creation date for deterministic recurrence math.
UPDATE provider_office_availability_requests
SET requested_start_date = DATE(created_at)
WHERE requested_start_date IS NULL;
