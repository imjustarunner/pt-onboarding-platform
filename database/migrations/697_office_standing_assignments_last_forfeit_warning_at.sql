-- Add last_forfeit_warning_at to office_standing_assignments.
-- The watchdog uses this to implement a two-phase forfeit:
--   Phase B1: send a 14-day warning notification, set this column to NOW().
--   Phase B2: only forfeit (is_active = FALSE) after this column is 14+ days old.
-- Any provider action (book, keep-available, extend, or manual forfeit) resets this to NULL.

ALTER TABLE office_standing_assignments
  ADD COLUMN last_forfeit_warning_at DATETIME NULL
    COMMENT 'When the pre-forfeit 14-day warning notification was sent. Actual auto-forfeit only fires 14+ days after this value.'
    AFTER last_two_week_confirmed_at;
