-- Migration 1381: client-affiliated contacts with appointment reminder prefs
CREATE TABLE IF NOT EXISTS client_contact_affiliations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  agency_contact_id INT NOT NULL,
  relationship_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'parent, school_staff, case_manager, referral_source, other, custom',
  email_reminders_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sms_reminders_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sms_opt_in TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when contact consented to SMS via email link or guardian enable+ack',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notify_ack_by_user_id INT NULL
    COMMENT 'Guardian/client/staff who approved the notification email',
  notify_ack_at DATETIME NULL,
  notify_email_sent_at DATETIME NULL,
  notify_email_message_id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  contact_last_choice VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'unchanged|email_only|sms_only|both|off — last choice from notification email',
  contact_choice_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cca_client_contact (client_id, agency_contact_id),
  KEY idx_cca_agency_client (agency_id, client_id, is_active),
  KEY idx_cca_contact (agency_contact_id, is_active),
  KEY idx_cca_reminders (client_id, is_active, email_reminders_enabled, sms_reminders_enabled),
  CONSTRAINT fk_cca_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cca_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cca_contact FOREIGN KEY (agency_contact_id) REFERENCES agency_contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
