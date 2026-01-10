-- Migration: Add certificate_template_url to agencies table
-- Description: Add certificate_template_url field to support agency-specific certificate templates from Google Docs

-- Add certificate_template_url to agencies table
ALTER TABLE agencies
ADD COLUMN certificate_template_url VARCHAR(500) NULL DEFAULT NULL AFTER contact_info;

-- Add index for certificate_template_url
CREATE INDEX idx_agencies_certificate_template_url ON agencies(certificate_template_url);

