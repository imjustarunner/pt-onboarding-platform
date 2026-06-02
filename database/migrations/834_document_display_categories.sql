-- Migration 834: Employee-facing document display categories

ALTER TABLE document_templates
  ADD COLUMN employee_display_category VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Hub section: onboarding, credentialing, personal, professional, compliance, signatures, reviews, other'
    AFTER document_type;

ALTER TABLE user_preferences
  ADD COLUMN documents_category_order_json JSON NULL
    COMMENT 'User-ordered list of document hub category ids for My Documents'
    AFTER toast_preferences;
