-- Migration: Add dashboard action icon fields to platform_branding and agencies
-- Description: Add icon fields for each quick action on the dashboard

-- Add dashboard action icon fields to platform_branding
-- Note: The migration script will catch "Duplicate column" errors and skip them
ALTER TABLE platform_branding
ADD COLUMN manage_agencies_icon_id INT NULL,
ADD COLUMN manage_modules_icon_id INT NULL,
ADD COLUMN manage_documents_icon_id INT NULL,
ADD COLUMN manage_users_icon_id INT NULL,
ADD COLUMN platform_settings_icon_id INT NULL,
ADD COLUMN view_all_progress_icon_id INT NULL,
ADD COLUMN progress_dashboard_icon_id INT NULL,
ADD COLUMN settings_icon_id INT NULL;

-- Add foreign key constraints for platform_branding
ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_manage_agencies_icon FOREIGN KEY (manage_agencies_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_modules_icon FOREIGN KEY (manage_modules_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_documents_icon FOREIGN KEY (manage_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_users_icon FOREIGN KEY (manage_users_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_platform_settings_icon FOREIGN KEY (platform_settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_view_all_progress_icon FOREIGN KEY (view_all_progress_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_progress_dashboard_icon FOREIGN KEY (progress_dashboard_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_settings_icon FOREIGN KEY (settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add dashboard action icon fields to agencies
ALTER TABLE agencies
ADD COLUMN manage_agencies_icon_id INT NULL,
ADD COLUMN manage_modules_icon_id INT NULL,
ADD COLUMN manage_documents_icon_id INT NULL,
ADD COLUMN manage_users_icon_id INT NULL,
ADD COLUMN platform_settings_icon_id INT NULL,
ADD COLUMN view_all_progress_icon_id INT NULL,
ADD COLUMN progress_dashboard_icon_id INT NULL,
ADD COLUMN settings_icon_id INT NULL;

-- Add foreign key constraints for agencies
ALTER TABLE agencies
ADD CONSTRAINT fk_agency_manage_agencies_icon FOREIGN KEY (manage_agencies_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_modules_icon FOREIGN KEY (manage_modules_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_documents_icon FOREIGN KEY (manage_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_users_icon FOREIGN KEY (manage_users_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_platform_settings_icon FOREIGN KEY (platform_settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_view_all_progress_icon FOREIGN KEY (view_all_progress_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_progress_dashboard_icon FOREIGN KEY (progress_dashboard_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_settings_icon FOREIGN KEY (settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL;
