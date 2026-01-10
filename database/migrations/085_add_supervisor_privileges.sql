-- Migration: Add supervisor privileges field
-- Description: Add has_supervisor_privileges field to allow admins, superadmins, and CPAs to be assigned as supervisors

ALTER TABLE users
ADD COLUMN has_supervisor_privileges BOOLEAN DEFAULT FALSE COMMENT 'Allows admins, superadmins, and CPAs to be assigned as supervisors while maintaining their primary roles';

-- Add index for efficient queries
CREATE INDEX idx_has_supervisor_privileges ON users(has_supervisor_privileges);
