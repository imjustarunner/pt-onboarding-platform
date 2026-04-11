-- Migration: Add agency_contact_id to message_logs
-- Description:
-- - Adds a nullable agency_contact_id column to message_logs to support messaging with non-client contacts.

ALTER TABLE message_logs
  ADD COLUMN agency_contact_id INT DEFAULT NULL AFTER client_id,
  ADD CONSTRAINT fk_message_logs_agency_contact FOREIGN KEY (agency_contact_id) REFERENCES agency_contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_message_logs_agency_contact ON message_logs(agency_contact_id);
