-- Migration: Add clinical organization type
-- Description:
-- - Expands agencies.organization_type enum to include clinical.

ALTER TABLE agencies
  MODIFY COLUMN organization_type ENUM('agency', 'school', 'program', 'learning', 'clinical')
  NOT NULL DEFAULT 'agency';
