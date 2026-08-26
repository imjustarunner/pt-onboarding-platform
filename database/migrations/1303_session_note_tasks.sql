-- Migration 1303: session_note task type + dedupe for pre-session documentation tasks

ALTER TABLE tasks
  MODIFY COLUMN task_type ENUM(
    'training',
    'document',
    'hiring',
    'custom',
    'escalation',
    'meeting_action',
    'session_note'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

INSERT INTO task_type_definitions
  (agency_id, slug, label, color_hex, icon_key, icon_choices_json, system_task_type, sort_order)
SELECT
  NULL,
  'session_note',
  'Notes',
  '#0f766e',
  'file-text',
  '["file-text","clipboard","pen","stethoscope"]',
  'session_note',
  15
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM task_type_definitions WHERE slug = 'session_note' AND agency_id IS NULL
);

CREATE TABLE IF NOT EXISTS session_note_task_sent (
  office_event_id INT NOT NULL,
  task_id INT NULL DEFAULT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (office_event_id),
  KEY idx_session_note_task_sent_task (task_id),
  CONSTRAINT fk_session_note_task_sent_event
    FOREIGN KEY (office_event_id) REFERENCES office_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'Dedupe: one Notes task per office_event created ~5 min before start';
