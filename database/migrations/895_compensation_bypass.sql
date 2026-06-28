-- Migration 895: Compensation level bypass flag
-- bypass=1 means the employee is categorized for reporting but their existing
-- rates are left alone (not overwritten from the level definition).
-- Default is effectively bypass for anyone without a row; this column makes it explicit.
-- Also allow level to be NULL so a category can be recorded without a specific level chosen yet.

ALTER TABLE payroll_user_compensation_levels
  MODIFY COLUMN level TINYINT NULL DEFAULT NULL COMMENT '1-5, NULL when bypass or category-only',
  ADD COLUMN bypass TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1=keep existing rates (bypass level apply), 0=rates driven by level'
    AFTER level;
