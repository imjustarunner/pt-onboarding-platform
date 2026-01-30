-- Migration: add bell schedule times to school_profiles
-- Purpose: store school-level bell schedule start/end time for quick reference.

ALTER TABLE school_profiles
  ADD COLUMN bell_schedule_start_time TIME NULL AFTER school_days_times;

ALTER TABLE school_profiles
  ADD COLUMN bell_schedule_end_time TIME NULL AFTER bell_schedule_start_time;

