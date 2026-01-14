-- Migration: Add permission attributes to users table
-- Description: Add cross-role capability attributes to support role flexibility
-- This allows staff to have provider privileges and providers to have staff privileges
-- while maintaining their primary role

ALTER TABLE users
ADD COLUMN has_provider_access BOOLEAN DEFAULT FALSE COMMENT 'Allows staff users to access provider features while maintaining their primary staff role',
ADD COLUMN has_staff_access BOOLEAN DEFAULT FALSE COMMENT 'Allows provider users to access staff features (add users, send notifications, give access) while maintaining their primary provider role';

-- Add indexes for efficient queries
CREATE INDEX idx_has_provider_access ON users(has_provider_access);
CREATE INDEX idx_has_staff_access ON users(has_staff_access);
