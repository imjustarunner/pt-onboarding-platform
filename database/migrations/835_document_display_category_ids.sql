-- Migration 835: Document hub category id reference (VARCHAR column; comment only)

ALTER TABLE document_templates
  MODIFY COLUMN employee_display_category VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Hub section: onboarding, payroll_tax, benefits, policies, licenses_credentials, credentialing, safety, training_ce, client_participant, personal, other';
