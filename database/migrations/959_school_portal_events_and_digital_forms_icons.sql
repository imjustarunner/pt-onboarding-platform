-- Migration 959: School Portal Events + Manage Digital Forms card icons
-- Purpose: tenant/platform-customizable icons for Events and Manage school digital forms cards

ALTER TABLE platform_branding
  ADD COLUMN school_portal_events_icon_id INT NULL,
  ADD COLUMN school_portal_digital_forms_icon_id INT NULL;

-- NOTE: Do not add foreign key constraints — some DBs hit MySQL's 64-key limit.

ALTER TABLE agencies
  ADD COLUMN school_portal_events_icon_id INT NULL,
  ADD COLUMN school_portal_digital_forms_icon_id INT NULL;
