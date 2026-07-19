-- Migration 991: link recurring supervision sessions into a series
ALTER TABLE supervision_sessions
  ADD COLUMN recurrence_series_id VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Shared id for recurring supervision occurrences',
  ADD COLUMN recurrence_frequency VARCHAR(16) NULL DEFAULT NULL
  COMMENT 'ONCE|WEEKLY|BIWEEKLY|MONTHLY',
  ADD COLUMN recurrence_index INT NULL DEFAULT NULL
  COMMENT '0-based index within the series';

CREATE INDEX idx_supervision_sessions_recurrence_series
  ON supervision_sessions (recurrence_series_id, start_at);
