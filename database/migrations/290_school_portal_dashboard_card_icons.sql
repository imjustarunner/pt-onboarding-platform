-- Migration: Add School Portal dashboard card icon fields
-- Purpose:
-- - Allow agency-level overrides for School Portal home cards (Providers/Days/Roster/Skills/Contact Admin)
-- - Provide platform defaults via platform_branding

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN school_portal_providers_icon_id INT NULL,
  ADD COLUMN school_portal_days_icon_id INT NULL,
  ADD COLUMN school_portal_roster_icon_id INT NULL,
  ADD COLUMN school_portal_skills_groups_icon_id INT NULL,
  ADD COLUMN school_portal_contact_admin_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_school_portal_providers_icon FOREIGN KEY (school_portal_providers_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_days_icon FOREIGN KEY (school_portal_days_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_roster_icon FOREIGN KEY (school_portal_roster_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_skills_groups_icon FOREIGN KEY (school_portal_skills_groups_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_contact_admin_icon FOREIGN KEY (school_portal_contact_admin_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Agency overrides
ALTER TABLE agencies
  ADD COLUMN school_portal_providers_icon_id INT NULL,
  ADD COLUMN school_portal_days_icon_id INT NULL,
  ADD COLUMN school_portal_roster_icon_id INT NULL,
  ADD COLUMN school_portal_skills_groups_icon_id INT NULL,
  ADD COLUMN school_portal_contact_admin_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_school_portal_providers_icon FOREIGN KEY (school_portal_providers_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_days_icon FOREIGN KEY (school_portal_days_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_roster_icon FOREIGN KEY (school_portal_roster_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_skills_groups_icon FOREIGN KEY (school_portal_skills_groups_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_contact_admin_icon FOREIGN KEY (school_portal_contact_admin_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

