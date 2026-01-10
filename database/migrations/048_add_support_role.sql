-- Migration: Add support role
-- Description: Add support role for users who can manage users and assign training but cannot create/edit modules or training focuses

-- Add support to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';

