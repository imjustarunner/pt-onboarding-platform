-- Migration: Ensure support role is in enum
-- Description: Ensure the 'support' role is included in the users.role enum
-- This is a safe migration that will work even if the role already exists

-- Add support to role enum (this will work even if support is already in the enum)
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';

