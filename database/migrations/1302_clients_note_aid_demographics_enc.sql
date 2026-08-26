-- Migration 1302: Note Aid encrypted demographics import fields
-- Operational plaintext columns for chart/SMS; encrypted envelope for PHI archive.

ALTER TABLE clients
  ADD COLUMN email VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Client email (demographics / reminders)'
    AFTER contact_phone;

ALTER TABLE clients
  ADD COLUMN timezone VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Client timezone label or IANA id from demographics import'
    AFTER email;

ALTER TABLE clients
  ADD COLUMN appointment_reminder_type VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Preferred appointment reminder channel (e.g. Text (SMS) only)'
    AFTER timezone;

ALTER TABLE clients
  ADD COLUMN demographics_phi_enc JSON NULL DEFAULT NULL
    COMMENT 'AES-GCM encrypted envelope of demographics imported via Note Aid'
    AFTER appointment_reminder_type;
