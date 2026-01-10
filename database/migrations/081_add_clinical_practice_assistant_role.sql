-- Migration: Add Clinical Practice Assistant role
-- Description: Add clinical_practice_assistant role to the users.role enum

-- Add clinical_practice_assistant to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';
