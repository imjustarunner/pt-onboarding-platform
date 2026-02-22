-- Persist recurrence intent for provider office availability requests.
-- Weekly requests are capped at 6 occurrences by app-layer validation.

ALTER TABLE provider_office_availability_requests
  ADD COLUMN requested_frequency ENUM('ONCE','WEEKLY','BIWEEKLY','MONTHLY') NOT NULL DEFAULT 'ONCE' AFTER notes,
  ADD COLUMN requested_occurrence_count SMALLINT NOT NULL DEFAULT 1 AFTER requested_frequency;
