-- Migration: Update users table roles
-- Description: Expand role enum to support new roles (admin, supervisor, clinician, facilitator, intern)

-- Note: MySQL doesn't support ALTER ENUM directly, so we need to recreate
-- This migration assumes the table exists and we're adding new roles

-- First, add a temporary column with new enum
ALTER TABLE users 
ADD COLUMN role_new ENUM('admin', 'supervisor', 'clinician', 'facilitator', 'intern') 
AFTER password_hash;

-- Copy data, mapping 'employee' to 'clinician'
UPDATE users 
SET role_new = CASE 
    WHEN role = 'admin' THEN 'admin'
    WHEN role = 'employee' THEN 'clinician'
    ELSE 'clinician'
END;

-- Drop old column
ALTER TABLE users DROP COLUMN role;

-- Rename new column
ALTER TABLE users CHANGE role_new role ENUM('admin', 'supervisor', 'clinician', 'facilitator', 'intern') DEFAULT 'clinician';

