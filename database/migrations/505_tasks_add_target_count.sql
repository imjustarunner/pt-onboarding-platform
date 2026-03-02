-- Add target_count to tasks for shared list items (e.g. "Catch up on clinical notes" with editable quantity)
ALTER TABLE tasks
  ADD COLUMN target_count INT NULL COMMENT 'Editable quantity for count-type tasks (e.g. notes to complete)' AFTER typical_time;
