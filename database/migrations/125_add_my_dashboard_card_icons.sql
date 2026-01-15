-- Migration: Add "My Dashboard" card icon fields to platform_branding and agencies
-- Description: Allow per-organization customization of user dashboard card icons, with platform defaults.

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_checklist_icon_id INT NULL,
  ADD COLUMN my_dashboard_training_icon_id INT NULL,
  ADD COLUMN my_dashboard_documents_icon_id INT NULL,
  ADD COLUMN my_dashboard_my_account_icon_id INT NULL,
  ADD COLUMN my_dashboard_on_demand_training_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_my_dashboard_checklist_icon FOREIGN KEY (my_dashboard_checklist_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_training_icon FOREIGN KEY (my_dashboard_training_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_documents_icon FOREIGN KEY (my_dashboard_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_my_account_icon FOREIGN KEY (my_dashboard_my_account_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_on_demand_training_icon FOREIGN KEY (my_dashboard_on_demand_training_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Organization overrides
ALTER TABLE agencies
  ADD COLUMN my_dashboard_checklist_icon_id INT NULL,
  ADD COLUMN my_dashboard_training_icon_id INT NULL,
  ADD COLUMN my_dashboard_documents_icon_id INT NULL,
  ADD COLUMN my_dashboard_my_account_icon_id INT NULL,
  ADD COLUMN my_dashboard_on_demand_training_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_my_dashboard_checklist_icon FOREIGN KEY (my_dashboard_checklist_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_training_icon FOREIGN KEY (my_dashboard_training_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_documents_icon FOREIGN KEY (my_dashboard_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_my_account_icon FOREIGN KEY (my_dashboard_my_account_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_on_demand_training_icon FOREIGN KEY (my_dashboard_on_demand_training_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

