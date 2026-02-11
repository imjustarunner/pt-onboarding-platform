-- Link multiple standing assignments into a recurring set (e.g., Mon/Wed/Fri).
ALTER TABLE office_standing_assignments
  ADD COLUMN recurrence_group_id VARCHAR(64) NULL AFTER assigned_frequency,
  ADD INDEX idx_office_standing_recurrence_group (recurrence_group_id);

