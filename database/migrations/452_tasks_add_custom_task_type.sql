-- Add 'custom' task type for user-created tasks (e.g. promoted from Momentum Stickies)
ALTER TABLE tasks
  MODIFY COLUMN task_type ENUM('training', 'document', 'hiring', 'custom') NOT NULL;
