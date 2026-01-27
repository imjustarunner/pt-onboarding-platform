-- Migration: Add hiring task type
-- Description: Allow generic hiring tasks (calls/interviews/follow-ups) linked via tasks.metadata.

ALTER TABLE tasks
MODIFY COLUMN task_type ENUM('training', 'document', 'hiring') NOT NULL;

