-- Challenge template library: add tenant-scoped templates plus icon/activity metadata
-- so challenge templates can mirror the weekly editor more closely.

ALTER TABLE challenge_task_templates
  ADD COLUMN is_tenant_template TINYINT(1) NOT NULL DEFAULT 0 AFTER is_global,
  ADD COLUMN icon VARCHAR(64) NULL AFTER description,
  ADD COLUMN activity_type VARCHAR(64) NULL AFTER icon;

CREATE INDEX idx_ctt_tenant_scope ON challenge_task_templates (agency_id, is_tenant_template);

ALTER TABLE challenge_weekly_tasks
  ADD COLUMN icon VARCHAR(64) NULL AFTER description,
  ADD COLUMN activity_type VARCHAR(64) NULL AFTER icon;
