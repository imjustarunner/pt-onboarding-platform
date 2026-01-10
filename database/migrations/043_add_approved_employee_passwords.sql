-- Migration: Add password fields for approved employee authentication
-- Description: Add company default password to agencies and individual passwords to approved_employee_emails

-- Add company default password hash to agencies table
ALTER TABLE agencies
ADD COLUMN company_default_password_hash VARCHAR(255) NULL AFTER terminology_settings;

-- Add individual password hash to approved_employee_emails table
ALTER TABLE approved_employee_emails
ADD COLUMN password_hash VARCHAR(255) NULL AFTER is_active;

-- Add index on password_hash for approved_employee_emails
CREATE INDEX idx_password_hash ON approved_employee_emails(password_hash);

