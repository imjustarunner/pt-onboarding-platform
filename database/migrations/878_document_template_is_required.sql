-- Migration 878: Add is_required flag to document_templates and tasks
-- Controls whether a pre-hire/onboarding document is mandatory (blocks promotion)
-- or optional (shown but not blocking). Also adds is_required to tasks so it
-- can be inherited from the template at assignment time.

ALTER TABLE document_templates
  ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = required for stage completion, 0 = optional';

ALTER TABLE tasks
  ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Inherited from document_templates.is_required at task creation time';
