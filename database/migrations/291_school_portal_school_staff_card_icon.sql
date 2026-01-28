-- Migration: Add School Portal "School staff" card icon fields
-- Purpose:
-- - Allow agency-level overrides for the School Portal "School staff" card
-- - Provide platform defaults via platform_branding

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN school_portal_school_staff_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_school_portal_school_staff_icon
    FOREIGN KEY (school_portal_school_staff_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Agency overrides
ALTER TABLE agencies
  ADD COLUMN school_portal_school_staff_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_school_portal_school_staff_icon
    FOREIGN KEY (school_portal_school_staff_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

