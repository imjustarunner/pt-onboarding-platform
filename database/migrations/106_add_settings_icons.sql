-- Migration: Add settings icon fields to platform_branding table
-- Description: Add icon_id fields for each settings menu item to allow custom icons instead of emojis
-- These are platform-level only (not agency-level)

ALTER TABLE platform_branding
  ADD COLUMN company_profile_icon_id INT NULL COMMENT 'Icon for Company Profile settings item' AFTER all_agencies_notifications_icon_id,
  ADD COLUMN team_roles_icon_id INT NULL COMMENT 'Icon for Team & Roles settings item' AFTER company_profile_icon_id,
  ADD COLUMN billing_icon_id INT NULL COMMENT 'Icon for Billing settings item' AFTER team_roles_icon_id,
  ADD COLUMN packages_icon_id INT NULL COMMENT 'Icon for Packages settings item' AFTER billing_icon_id,
  ADD COLUMN checklist_items_icon_id INT NULL COMMENT 'Icon for Checklist Items settings item' AFTER packages_icon_id,
  ADD COLUMN field_definitions_icon_id INT NULL COMMENT 'Icon for Field Definitions settings item' AFTER checklist_items_icon_id,
  ADD COLUMN branding_templates_icon_id INT NULL COMMENT 'Icon for Branding & Templates settings item' AFTER field_definitions_icon_id,
  ADD COLUMN assets_icon_id INT NULL COMMENT 'Icon for Assets (Icons/Fonts) settings item' AFTER branding_templates_icon_id,
  ADD COLUMN communications_icon_id INT NULL COMMENT 'Icon for Communications settings item' AFTER assets_icon_id,
  ADD COLUMN integrations_icon_id INT NULL COMMENT 'Icon for Integrations settings item' AFTER communications_icon_id,
  ADD COLUMN archive_icon_id INT NULL COMMENT 'Icon for Archive settings item' AFTER integrations_icon_id,
  ADD FOREIGN KEY (company_profile_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (team_roles_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (billing_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (packages_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (checklist_items_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (field_definitions_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (branding_templates_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (assets_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (communications_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (integrations_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (archive_icon_id) REFERENCES icons(id) ON DELETE SET NULL;
