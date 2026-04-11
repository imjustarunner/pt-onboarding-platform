-- Migration: Add ClubWebApp organization type
-- Description:
-- - Expands agencies.organization_type enum to include ClubWebApp.

ALTER TABLE agencies
  MODIFY COLUMN organization_type ENUM('agency', 'school', 'program', 'learning', 'clinical', 'affiliation', 'ClubWebApp')
  NOT NULL DEFAULT 'agency';
