-- Migration 1289: Platform Gear / Materials cross-tenant capability
ALTER TABLE users
  ADD COLUMN has_platform_gear_access TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Superadmin-granted: manage Gear/Equipment/Materials for all tenant agencies'
  AFTER has_outreach_access;
