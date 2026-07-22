-- Migration 1031: series-level Keep window for ICS coverage flags
-- Keep suppresses re-flagging a recurring office series until this date (typically today + 28 days).

ALTER TABLE office_standing_assignments
  ADD COLUMN ics_coverage_keep_until DATE NULL DEFAULT NULL
  COMMENT 'When set (date >= today), ICS coverage audit will not re-flag this series';
