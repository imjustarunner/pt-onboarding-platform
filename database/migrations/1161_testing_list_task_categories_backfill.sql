-- Migration 1161: Backfill categories for Testing Needed list tasks stuck on general
UPDATE tasks
SET category = 'tasks_hub', categories = JSON_ARRAY('tasks_hub')
WHERE (category = 'general' OR categories IS NULL OR categories = JSON_ARRAY('general'))
  AND (
    LOWER(title) LIKE '%project workspace%'
    OR LOWER(title) LIKE '%bulk assign%'
    OR LOWER(title) LIKE '%bulk category%'
    OR LOWER(title) LIKE '%shared list%'
    OR LOWER(title) LIKE '%inline quick-edit%'
    OR LOWER(title) LIKE '%task table%'
    OR LOWER(title) LIKE '%task category%'
    OR LOWER(title) LIKE '%category column%'
    OR LOWER(title) LIKE '%popover%'
    OR LOWER(title) LIKE '%categories%'
  );

UPDATE tasks
SET category = 'ui_ux', categories = JSON_ARRAY('ui_ux')
WHERE (category = 'general' OR categories IS NULL OR categories = JSON_ARRAY('general'))
  AND (
    LOWER(title) LIKE '%layout%'
    OR LOWER(title) LIKE '%one-line%'
    OR LOWER(title) LIKE '%ui/ux%'
  );

UPDATE tasks
SET category = 'qa_testing', categories = JSON_ARRAY('qa_testing')
WHERE (category = 'general' OR categories IS NULL OR categories = JSON_ARRAY('general'))
  AND (
    title LIKE 'Test:%'
    OR task_list_id = 10
  );
