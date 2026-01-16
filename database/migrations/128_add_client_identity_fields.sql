-- Migration: Add client identity fields for bulk upload
-- Description: Adds full_name and ensures identifier_code uniqueness per agency.

ALTER TABLE clients
  ADD COLUMN full_name VARCHAR(255) NULL AFTER initials,
  ADD UNIQUE KEY uniq_client_identifier (agency_id, identifier_code);

