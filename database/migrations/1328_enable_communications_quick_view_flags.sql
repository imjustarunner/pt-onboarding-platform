-- Migration 1328: enable Communications Quick View expansion flags by default;
-- same-day temporary presence (out_day / available_offline) expires at local midnight.

UPDATE agency_email_settings
SET quick_view_enabled = 1,
    secure_client_message_email_enabled = 1,
    personal_email_digest_enabled = 1,
    hold_staff_school_outside_availability = 1,
    client_ooo_auto_reply_enabled = 1,
    unknown_sender_box_enabled = 1,
    intent_review_enabled = 1;

ALTER TABLE agency_email_settings
  MODIFY COLUMN quick_view_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Enable Quick View for this tenant',
  MODIFY COLUMN secure_client_message_email_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Send secure-message notification emails to clients/guardians';
