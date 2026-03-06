-- Add recurrence metadata so meeting series can support "delete single" and "delete future".

ALTER TABLE provider_schedule_events
  ADD COLUMN recurrence_series_id VARCHAR(64) NULL AFTER status,
  ADD COLUMN recurrence_frequency VARCHAR(16) NULL AFTER recurrence_series_id,
  ADD COLUMN recurrence_policy VARCHAR(16) NULL AFTER recurrence_frequency,
  ADD COLUMN recurrence_index INT NULL AFTER recurrence_policy;

CREATE INDEX idx_pse_recurrence_series ON provider_schedule_events (recurrence_series_id);
CREATE INDEX idx_pse_recurrence_series_window ON provider_schedule_events (recurrence_series_id, provider_id, start_at, start_date, status);
