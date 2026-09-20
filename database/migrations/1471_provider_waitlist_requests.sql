-- Waitlist requests use the existing encrypted, reply-capable support conversation.
ALTER TABLE support_tickets
 ADD COLUMN waitlist_provider_id INT NULL,
 ADD COLUMN waitlist_service_type VARCHAR(32) NULL,
 ADD COLUMN waitlist_format VARCHAR(16) NULL,
 ADD INDEX idx_provider_waitlist (agency_id, waitlist_provider_id, status);
