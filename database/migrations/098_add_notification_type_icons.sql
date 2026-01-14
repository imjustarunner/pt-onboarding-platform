-- Migration: Add notification type icon fields to platform_branding and agencies
-- Description: Allow platform and agency-level customization of notification type icons

-- Add notification type icon fields to platform_branding
ALTER TABLE platform_branding
ADD COLUMN status_expired_icon_id INT NULL,
ADD COLUMN temp_password_expired_icon_id INT NULL,
ADD COLUMN task_overdue_icon_id INT NULL,
ADD COLUMN onboarding_completed_icon_id INT NULL,
ADD COLUMN invitation_expired_icon_id INT NULL,
ADD COLUMN first_login_icon_id INT NULL,
ADD COLUMN first_login_pending_icon_id INT NULL,
ADD COLUMN password_changed_icon_id INT NULL;

-- Add foreign key constraints for platform_branding
ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_status_expired_icon 
FOREIGN KEY (status_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_temp_password_expired_icon 
FOREIGN KEY (temp_password_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_task_overdue_icon 
FOREIGN KEY (task_overdue_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_onboarding_completed_icon 
FOREIGN KEY (onboarding_completed_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_invitation_expired_icon 
FOREIGN KEY (invitation_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_first_login_icon 
FOREIGN KEY (first_login_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_first_login_pending_icon 
FOREIGN KEY (first_login_pending_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_password_changed_icon 
FOREIGN KEY (password_changed_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add notification type icon fields to agencies
ALTER TABLE agencies
ADD COLUMN status_expired_icon_id INT NULL,
ADD COLUMN temp_password_expired_icon_id INT NULL,
ADD COLUMN task_overdue_icon_id INT NULL,
ADD COLUMN onboarding_completed_icon_id INT NULL,
ADD COLUMN invitation_expired_icon_id INT NULL,
ADD COLUMN first_login_icon_id INT NULL,
ADD COLUMN first_login_pending_icon_id INT NULL,
ADD COLUMN password_changed_icon_id INT NULL;

-- Add foreign key constraints for agencies
ALTER TABLE agencies
ADD CONSTRAINT fk_agency_status_expired_icon 
FOREIGN KEY (status_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_temp_password_expired_icon 
FOREIGN KEY (temp_password_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_task_overdue_icon 
FOREIGN KEY (task_overdue_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_onboarding_completed_icon 
FOREIGN KEY (onboarding_completed_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_invitation_expired_icon 
FOREIGN KEY (invitation_expired_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_first_login_icon 
FOREIGN KEY (first_login_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_first_login_pending_icon 
FOREIGN KEY (first_login_pending_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_password_changed_icon 
FOREIGN KEY (password_changed_icon_id) REFERENCES icons(id) ON DELETE SET NULL;
