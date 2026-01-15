-- Migration: Add contact_phone to clients
-- Description: Used to map inbound SMS (From number) to a client record for initials/agency context.

ALTER TABLE clients
ADD COLUMN contact_phone VARCHAR(20) NULL COMMENT 'Client/guardian contact phone (E.164) used for messaging' AFTER initials;

CREATE INDEX idx_clients_contact_phone ON clients(contact_phone);

