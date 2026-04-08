-- Add is_global flag to challenge_task_templates so SSTC can maintain a shared library
-- accessible to all clubs.

ALTER TABLE challenge_task_templates
  ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 0 AFTER agency_id;

CREATE INDEX idx_ctt_global ON challenge_task_templates (is_global);
