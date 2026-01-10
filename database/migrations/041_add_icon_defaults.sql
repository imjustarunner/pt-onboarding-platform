-- Migration: Add icon defaults to platform_branding and agencies
-- Description: Add default icon fields for training focus, module, user, and document icons

-- Add default icon fields to platform_branding
ALTER TABLE platform_branding
ADD COLUMN training_focus_default_icon_id INT NULL AFTER display_font,
ADD COLUMN module_default_icon_id INT NULL AFTER training_focus_default_icon_id,
ADD COLUMN user_default_icon_id INT NULL AFTER module_default_icon_id,
ADD COLUMN document_default_icon_id INT NULL AFTER user_default_icon_id,
ADD CONSTRAINT fk_platform_training_focus_icon FOREIGN KEY (training_focus_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_module_icon FOREIGN KEY (module_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_user_icon FOREIGN KEY (user_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_document_icon FOREIGN KEY (document_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add default icon fields to agencies
ALTER TABLE agencies
ADD COLUMN training_focus_default_icon_id INT NULL AFTER icon_id,
ADD COLUMN module_default_icon_id INT NULL AFTER training_focus_default_icon_id,
ADD COLUMN user_default_icon_id INT NULL AFTER module_default_icon_id,
ADD COLUMN document_default_icon_id INT NULL AFTER user_default_icon_id,
ADD CONSTRAINT fk_agency_training_focus_icon FOREIGN KEY (training_focus_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_module_icon FOREIGN KEY (module_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_user_icon FOREIGN KEY (user_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_document_icon FOREIGN KEY (document_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

