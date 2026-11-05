-- Migration 1764: a schedule clip stays on the appointment unless it is also shown on the schedule
ALTER TABLE appointment_staff_alerts
  ADD COLUMN show_on_schedule TINYINT NOT NULL DEFAULT 1
  COMMENT '1 = flag this clip on the schedule face; existing clips stay visible';
