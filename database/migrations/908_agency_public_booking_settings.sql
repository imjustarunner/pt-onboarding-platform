-- Migration 908: tenant-editable public booking page content
-- Used by life coach / consultant (and agency) booking frames.
ALTER TABLE agencies
  ADD COLUMN public_booking_settings JSON NULL DEFAULT NULL
  COMMENT 'Editable public booking page copy/branding shell (hero, nav, specialties, value props)';
