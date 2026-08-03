-- Migration 1113: Agency-level default and per-template-type outbound sender identities
ALTER TABLE agency_email_settings
  ADD COLUMN default_sender_identity_id INT NULL DEFAULT NULL
    COMMENT 'Fallback sender identity for automated emails without a more specific mapping',
  ADD COLUMN template_sender_identity_json JSON NULL DEFAULT NULL
    COMMENT 'Map of template_type or email category key -> email_sender_identities.id';
