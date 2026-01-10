-- Migration: Add super_admin role
-- Description: Add super_admin role for PlotTwistCo full system access

-- Add super_admin to role enum
ALTER TABLE users 
MODIFY COLUMN role ENUM('super_admin', 'admin', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';

