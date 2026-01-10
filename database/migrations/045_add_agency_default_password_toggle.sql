-- Migration: Add Agency Default Password Toggle
-- Description: Add toggle to control whether agency uses default passwords or requires individual passwords

-- Add use_default_password toggle to agencies table
ALTER TABLE agencies
ADD COLUMN use_default_password BOOLEAN DEFAULT TRUE AFTER company_default_password_hash;

-- Set default to TRUE for existing agencies
UPDATE agencies SET use_default_password = TRUE WHERE use_default_password IS NULL;

