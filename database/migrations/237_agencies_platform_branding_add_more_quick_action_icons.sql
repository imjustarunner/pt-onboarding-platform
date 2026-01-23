ALTER TABLE agencies
  ADD COLUMN dashboard_notifications_icon_id INT NULL,
  ADD COLUMN dashboard_communications_icon_id INT NULL,
  ADD COLUMN dashboard_chats_icon_id INT NULL,
  ADD COLUMN dashboard_payroll_icon_id INT NULL,
  ADD COLUMN dashboard_billing_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN dashboard_notifications_icon_id INT NULL,
  ADD COLUMN dashboard_communications_icon_id INT NULL,
  ADD COLUMN dashboard_chats_icon_id INT NULL,
  ADD COLUMN dashboard_payroll_icon_id INT NULL,
  ADD COLUMN dashboard_billing_icon_id INT NULL;

