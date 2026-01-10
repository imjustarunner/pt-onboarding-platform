-- Migration: Fix role enum to include support and staff
-- Description: Add support and staff roles to the users.role enum
-- This migration ensures both roles are present in the correct order

-- Add support and staff to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';
