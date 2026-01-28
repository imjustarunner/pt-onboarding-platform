-- Migration: My Dashboard card icons for communications/chats/notifications

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_communications_icon_id INT NULL,
  ADD COLUMN my_dashboard_chats_icon_id INT NULL,
  ADD COLUMN my_dashboard_notifications_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_my_dashboard_communications_icon FOREIGN KEY (my_dashboard_communications_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_chats_icon FOREIGN KEY (my_dashboard_chats_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_my_dashboard_notifications_icon FOREIGN KEY (my_dashboard_notifications_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Organization overrides
ALTER TABLE agencies
  ADD COLUMN my_dashboard_communications_icon_id INT NULL,
  ADD COLUMN my_dashboard_chats_icon_id INT NULL,
  ADD COLUMN my_dashboard_notifications_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_my_dashboard_communications_icon FOREIGN KEY (my_dashboard_communications_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_chats_icon FOREIGN KEY (my_dashboard_chats_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_my_dashboard_notifications_icon FOREIGN KEY (my_dashboard_notifications_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

