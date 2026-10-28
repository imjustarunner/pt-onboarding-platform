-- Keep approved training credit separate from measured platform attendance.
-- Attendance synchronization deliberately leaves these approval fields untouched.
ALTER TABLE scheduled_training_logs
  ADD COLUMN credited_seconds INT NULL,
  ADD COLUMN credited_type VARCHAR(32) NULL,
  ADD COLUMN credited_by_user_id INT NULL,
  ADD COLUMN credit_approved_by_user_id INT NULL,
  ADD COLUMN credit_approved_at DATETIME NULL,
  ADD COLUMN credit_reason VARCHAR(1000) NULL;
