-- Migration 997: Per-date booking skips so cancelling one occurrence
-- does not get resurrected by rematerialization of an active booking plan.

ALTER TABLE office_booking_plans
  ADD COLUMN skipped_dates_json JSON NULL
  COMMENT 'YYYY-MM-DD dates unbooked for this plan only; future weeks still book';
