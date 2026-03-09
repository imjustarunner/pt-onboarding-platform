-- Widen audience column to accommodate prefixed values like
-- title:X, credential:X, service_focus:X, department:N
ALTER TABLE agency_scheduled_announcements
  MODIFY COLUMN audience VARCHAR(255) NOT NULL DEFAULT 'everyone';
