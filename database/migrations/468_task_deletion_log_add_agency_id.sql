-- Add agency_id for Audit Center scoping
ALTER TABLE task_deletion_log
  ADD COLUMN agency_id INT NULL AFTER actor_user_id,
  ADD INDEX idx_task_deletion_agency (agency_id),
  ADD CONSTRAINT fk_task_deletion_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;
