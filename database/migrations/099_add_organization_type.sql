-- Migration: Add organization_type to agencies table
-- Description: Support multiple organization types (Agency, School, Program, Learning) while preserving existing agency functionality

-- Add organization_type column with ENUM constraint
ALTER TABLE agencies
ADD COLUMN organization_type ENUM('agency', 'school', 'program', 'learning') DEFAULT 'agency' NOT NULL AFTER slug;

-- Add index on organization_type for faster queries
CREATE INDEX idx_agencies_organization_type ON agencies(organization_type);

-- Update all existing agencies to have organization_type = 'agency' (backward compatibility)
UPDATE agencies SET organization_type = 'agency' WHERE organization_type IS NULL OR organization_type = '';

-- Ensure slug remains unique across all organization types (already enforced by UNIQUE constraint)
-- The existing UNIQUE constraint on slug will continue to work for all organization types
