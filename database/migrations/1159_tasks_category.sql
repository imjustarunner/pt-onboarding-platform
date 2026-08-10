-- Migration 1159: Task category for organizing work items (separate from work type)
ALTER TABLE tasks
  ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'general'
  COMMENT 'High-level bucket: qa_testing, payroll, schools, tasks_hub, etc.'
  AFTER work_type_icon_key;

ALTER TABLE tasks
  ADD INDEX idx_tasks_category (category);

-- Backfill agent-filed "Test:" tasks and related testing-list items
UPDATE tasks
SET category = 'payroll'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%Payroll%'
    OR title LIKE '%pay stub%'
    OR title LIKE '%additional pay%'
    OR title LIKE '%supervision pay%'
    OR title LIKE '%Direct/Indirect%'
    OR title LIKE '%ADP%'
  );

UPDATE tasks
SET category = 'schools'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%school%'
    OR title LIKE '%Year Update%'
    OR title LIKE '%School Portal%'
    OR title LIKE '%School Management%'
    OR title LIKE '%reinit%'
    OR title LIKE '%coverage%'
    OR title LIKE '%provider school%'
  );

UPDATE tasks
SET category = 'assistant'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%Ask Assistant%'
    OR title LIKE '%assistant%routing%'
    OR title LIKE '%assistant capability%'
  );

UPDATE tasks
SET category = 'analytics'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%usage analytics%'
    OR title LIKE '%nav shortcut%'
    OR title LIKE '%Quick Nav%'
    OR title LIKE '%action-frequenc%'
  );

UPDATE tasks
SET category = 'tasks_hub'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%project workspace%'
    OR title LIKE '%Project workspace%'
    OR title LIKE '%shared list%'
    OR title LIKE '%inline quick-edit%'
    OR title LIKE '%bulk assign%'
    OR title LIKE '%share, print%'
    OR title LIKE '%print, and export%'
    OR title LIKE '%task table%'
  );

UPDATE tasks
SET category = 'bug_fix'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%fix%'
    OR title LIKE '%Fix%'
    OR title LIKE '%broken%'
    OR title LIKE '%regression%'
  )
  AND title LIKE 'Test:%';

UPDATE tasks
SET category = 'ui_ux'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE '%UI%'
    OR title LIKE '%layout%'
    OR title LIKE '%polish%'
    OR title LIKE '%heatmap%'
  );

UPDATE tasks
SET category = 'qa_testing'
WHERE (category = 'general' OR category IS NULL)
  AND (
    title LIKE 'Test:%'
    OR task_list_id = 10
  );
