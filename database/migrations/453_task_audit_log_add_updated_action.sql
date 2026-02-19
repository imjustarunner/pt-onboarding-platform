-- Add 'updated' action type for task edits (e.g. from Momentum/Gemini)
ALTER TABLE task_audit_log
  MODIFY COLUMN action_type ENUM('assigned', 'completed', 'overridden', 'due_date_changed', 'reminder_sent', 'updated') NOT NULL;
