-- Migration 826: Mark clients absent for an event session day at the kiosk
-- When a family has confirmed they are not attending, staff can record absent
-- status with a reason instead of leaving the child on the pending check-in list.

ALTER TABLE event_day_kiosk_checkins
  MODIFY COLUMN action ENUM('check_in', 'check_out', 'absent') NOT NULL,
  ADD COLUMN absence_reason VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'Staff-recorded reason when client marked absent for the session day'
    AFTER checked_out_at;
