-- Migration: Add provider-level school info blurb to users
-- Purpose: One blurb per provider used across all school portals (replaces per-school provider_school_profiles.school_info_blurb).
--          provider_school_profiles remains for backward compatibility; user-level blurb takes precedence.

ALTER TABLE users
  ADD COLUMN provider_school_info_blurb TEXT NULL
  COMMENT 'Short blurb shown in school portal provider profile. Shared across all schools.';
