ALTER TABLE agencies
  ADD COLUMN my_dashboard_payroll_icon_id INT NULL,
  ADD COLUMN my_dashboard_submit_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_payroll_icon_id INT NULL,
  ADD COLUMN my_dashboard_submit_icon_id INT NULL;

