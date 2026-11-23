ALTER TABLE provider_schedule_events
  ADD COLUMN calendar_privacy_reconciled_at DATETIME NULL,
  ADD COLUMN calendar_privacy_retry_at DATETIME NULL,
  ADD KEY idx_calendar_privacy_reconciliation (calendar_privacy_reconciled_at, calendar_privacy_retry_at);
