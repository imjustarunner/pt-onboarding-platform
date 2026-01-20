-- Migration: add secondary_contact_text to school_profiles
-- Purpose: allow a freeform secondary contact field for school organizations (directory/contact tab)

ALTER TABLE school_profiles
  ADD COLUMN secondary_contact_text TEXT NULL AFTER primary_contact_role;

