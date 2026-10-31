-- Preserve all outreach receipts, authored templates and opt-in windows.
-- No messages or enrollments are created by this migration.
ALTER TABLE school_provider_contact_plans ADD COLUMN second_template TEXT NULL;
ALTER TABLE school_provider_contact_plans ADD COLUMN final_template TEXT NULL;
ALTER TABLE school_provider_contact_plans ADD COLUMN sms_template TEXT NULL;
ALTER TABLE school_provider_contact_plans ADD COLUMN required_by_admin TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE school_provider_contact_plans ADD COLUMN required_by_user_id INT NULL;
ALTER TABLE school_contact_workflows ADD COLUMN second_contact_at DATETIME NULL;
ALTER TABLE school_contact_workflows ADD COLUMN final_contact_at DATETIME NULL;
ALTER TABLE school_contact_workflows ADD COLUMN provider_notified_at DATETIME NULL;
ALTER TABLE school_contact_workflows ADD COLUMN last_intake_reminder_at DATETIME NULL;
ALTER TABLE school_contact_workflows ADD COLUMN intake_arranged_at DATETIME NULL;
ALTER TABLE school_contact_workflow_steps ADD COLUMN channel VARCHAR(16) NULL;
ALTER TABLE school_contact_workflow_steps ADD COLUMN conversation_id BIGINT UNSIGNED NULL;
