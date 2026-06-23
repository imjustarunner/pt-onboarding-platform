-- Migration 877: Add prehire_settings JSON column to agencies for pre-hire workflow configuration
ALTER TABLE agencies
  ADD COLUMN prehire_settings JSON NULL DEFAULT NULL
  COMMENT 'Pre-hire workflow settings: default_prehire_package_id, default_onboarding_package_id, default_contract_template_id, token_expiry_hours, invite_email_subject, invite_email_body';
