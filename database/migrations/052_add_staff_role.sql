-- Migration: Add staff role
-- Description: Add staff role for users who are in training and will transition to support role after onboarding. Same access as clinician, facilitator, and intern.

-- Add staff to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';

