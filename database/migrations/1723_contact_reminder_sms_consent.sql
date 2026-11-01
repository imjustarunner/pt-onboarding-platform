-- Recipient START consent is separate from a guardian's reminder preferences.
-- Existing sms_opt_in values may have been set by a guardian; they are not
-- promoted to recipient consent by this migration.
ALTER TABLE client_contact_affiliations
  ADD COLUMN sms_consent_phone_hash CHAR(64) NULL,
  ADD COLUMN sms_consent_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN sms_sender_number_id INT NULL,
  ADD COLUMN sms_invitation_permission_at DATETIME NULL,
  ADD COLUMN sms_invitation_permission_by_user_id INT NULL,
  ADD COLUMN sms_invitation_attempted_at DATETIME NULL,
  ADD COLUMN sms_invitation_sent_at DATETIME NULL,
  ADD COLUMN sms_invitation_status VARCHAR(24) NULL,
  ADD COLUMN sms_invitation_error VARCHAR(80) NULL,
  ADD COLUMN sms_consent_event_at DATETIME NULL,
  ADD COLUMN sms_consent_message_id VARCHAR(191) NULL;

-- Each additional contact has independent delivery bookkeeping; their reminder
-- does not depend on whether a guardian also receives the same channel.
ALTER TABLE appointment_reminders
  ADD COLUMN recipient_affiliation_id BIGINT UNSIGNED NULL,
  ADD KEY idx_reminder_affiliation (recipient_affiliation_id, status),
  ADD UNIQUE KEY uq_reminder_parent_affiliation (parent_reminder_id, recipient_affiliation_id);
