-- Migration 1105: Tasks hub sources (escalation / meeting_action projections + department)

ALTER TABLE tasks
  MODIFY COLUMN task_type ENUM(
    'training',
    'document',
    'hiring',
    'custom',
    'escalation',
    'meeting_action'
  ) NOT NULL;

ALTER TABLE tasks
  ADD COLUMN department_id INT NULL DEFAULT NULL
  COMMENT 'Optional agency department for filtering'
  AFTER typical_time;

ALTER TABLE tasks
  ADD COLUMN source_ref_type VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'escalation | meeting_action when projected from another system'
  AFTER department_id;

ALTER TABLE tasks
  ADD COLUMN source_ref_id VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'External id (ticket id or eventId:actionItemId)'
  AFTER source_ref_type;

ALTER TABLE tasks
  ADD COLUMN linked_schedule_event_id INT NULL DEFAULT NULL
  COMMENT 'Meeting event for summary/transcript deep link'
  AFTER source_ref_id;

ALTER TABLE tasks
  ADD INDEX idx_tasks_department (department_id);

ALTER TABLE tasks
  ADD INDEX idx_tasks_linked_event (linked_schedule_event_id);

ALTER TABLE tasks
  ADD UNIQUE INDEX uq_tasks_source_ref (source_ref_type, source_ref_id);
