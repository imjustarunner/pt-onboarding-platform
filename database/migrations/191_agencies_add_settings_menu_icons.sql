-- Migration: Add settings menu icon override fields to agencies table
-- Description: Allows each agency/org to override platform settings navigation icons.
-- These correspond to platform_branding settings icon fields (migration 106_add_settings_icons.sql).

ALTER TABLE agencies
  ADD COLUMN company_profile_icon_id INT NULL COMMENT 'Icon override for Company Profile settings item' AFTER settings_icon_id,
  ADD COLUMN team_roles_icon_id INT NULL COMMENT 'Icon override for Team & Roles settings item' AFTER company_profile_icon_id,
  ADD COLUMN billing_icon_id INT NULL COMMENT 'Icon override for Billing settings item' AFTER team_roles_icon_id,
  ADD COLUMN packages_icon_id INT NULL COMMENT 'Icon override for Packages settings item' AFTER billing_icon_id,
  ADD COLUMN checklist_items_icon_id INT NULL COMMENT 'Icon override for Checklist Items settings item' AFTER packages_icon_id,
  ADD COLUMN field_definitions_icon_id INT NULL COMMENT 'Icon override for Field Definitions settings item' AFTER checklist_items_icon_id,
  ADD COLUMN branding_templates_icon_id INT NULL COMMENT 'Icon override for Branding & Templates settings item' AFTER field_definitions_icon_id,
  ADD COLUMN assets_icon_id INT NULL COMMENT 'Icon override for Assets settings item' AFTER branding_templates_icon_id,
  ADD COLUMN communications_icon_id INT NULL COMMENT 'Icon override for Communications settings item' AFTER assets_icon_id,
  ADD COLUMN integrations_icon_id INT NULL COMMENT 'Icon override for Integrations settings item' AFTER communications_icon_id,
  ADD COLUMN archive_icon_id INT NULL COMMENT 'Icon override for Archive settings item' AFTER integrations_icon_id,
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

