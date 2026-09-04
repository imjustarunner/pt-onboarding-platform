-- Migration 1371: Allow null task_id on user_specific_documents
-- Contract generation creates the USD before the task, then links task_id.
ALTER TABLE user_specific_documents
  MODIFY COLUMN task_id INT NULL
  COMMENT 'Linked document task (may be set after insert during contract generation)';
