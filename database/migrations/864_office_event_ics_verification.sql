-- Migration 864: ICS session verification columns on office_events
-- Adds columns to track ICS overlap verification and admin-reviewed coverage flags.
-- Replaces the old auto-drop (downgradeBookedWithoutExternalOverlap) with a flag-and-review flow.

ALTER TABLE office_events
  ADD COLUMN last_ics_overlap_at DATETIME NULL DEFAULT NULL
    COMMENT 'Last time an ICS busy block overlapped this event',
  ADD COLUMN ics_flag_type ENUM('no_coverage','non_clinical_busy','partial_coverage') NULL DEFAULT NULL
    COMMENT 'Coverage flag set by 6-week ICS audit',
  ADD COLUMN ics_flagged_at DATETIME NULL DEFAULT NULL
    COMMENT 'When the coverage flag was last set by the watchdog audit',
  ADD COLUMN ics_flag_cleared_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Admin user who cleared (kept) this flag',
  ADD COLUMN ics_flag_cleared_at DATETIME NULL DEFAULT NULL
    COMMENT 'When an admin cleared the coverage flag';

INSERT INTO notification_triggers (trigger_key, name, description)
VALUES
  ('office_schedule_coverage_flag',
   'Office coverage flag for review',
   'Sent to scheduling admins when an office slot has insufficient ICS session coverage at the 6-week audit.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);
