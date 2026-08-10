-- Migration 1160: Multi-select task categories (JSON array)
ALTER TABLE tasks
  ADD COLUMN categories JSON NULL
  COMMENT 'Array of category slugs; category column holds primary/first value'
  AFTER category;

UPDATE tasks
SET categories = JSON_ARRAY(category)
WHERE categories IS NULL AND category IS NOT NULL AND category != '';

UPDATE tasks
SET categories = JSON_ARRAY('general')
WHERE categories IS NULL;
