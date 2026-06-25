-- Migration 882: Explicit lifecycle tagging on documents and per-user checklist scoping

-- Link document templates directly to lifecycle checklist item_key values
ALTER TABLE document_templates
  ADD COLUMN lifecycle_item_key VARCHAR(100) NULL DEFAULT NULL
  COMMENT 'lifecycle_checklist_definitions.item_key — auto-sync + scope when task assigned';

-- Optional per-package lifecycle items (manual HR steps, orientation, equipment, etc.)
ALTER TABLE onboarding_packages
  ADD COLUMN lifecycle_item_keys JSON NULL DEFAULT NULL
  COMMENT 'Array of lifecycle_checklist_definitions.item_key values scoped when package is assigned';

-- Track which lifecycle items apply to each user (from packages, tasks, or HR)
CREATE TABLE user_lifecycle_scoped_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  source ENUM('document_task', 'training_task', 'package', 'manual', 'offboarding', 'backfill') NOT NULL DEFAULT 'package',
  source_id INT NULL COMMENT 'task id, package id, or definition id depending on source',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_lifecycle_scope (user_id, item_key),
  INDEX idx_ulsi_user (user_id),
  INDEX idx_ulsi_item_key (item_key)
);

-- How visibility works: assigned = only when scoped; always = show for all applicable roles
ALTER TABLE lifecycle_checklist_definitions
  ADD COLUMN scope_mode ENUM('assigned', 'always') NOT NULL DEFAULT 'assigned'
  COMMENT 'assigned = show only when user is scoped via package/task; always = baseline HR checklist';

-- Milestone / account fields remain visible without assignment
UPDATE lifecycle_checklist_definitions
SET scope_mode = 'always'
WHERE integration_type IN ('user_info_field', 'account_setup', 'credentialing', 'supervision_session');
