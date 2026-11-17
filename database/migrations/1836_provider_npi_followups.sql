-- System-created tasks must identify automation without impersonating a human.
-- Existing human attribution remains unchanged. New automation writes append
-- explicit source/actor metadata and security_evidence in the same transaction.
ALTER TABLE tasks MODIFY COLUMN assigned_by_user_id INT NULL;
ALTER TABLE task_audit_log MODIFY COLUMN actor_user_id INT NULL;
