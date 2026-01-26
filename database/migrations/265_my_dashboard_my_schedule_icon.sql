/*
Add icon slot for "My Schedule" card on the My Dashboard rail.

This matches the existing "My Dashboard" icon override pattern:
- platform_branding provides defaults
- agencies can override per organization
*/

ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_my_schedule_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_my_dashboard_my_schedule_icon
  FOREIGN KEY (my_dashboard_my_schedule_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

ALTER TABLE agencies
  ADD COLUMN my_dashboard_my_schedule_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_my_dashboard_my_schedule_icon
  FOREIGN KEY (my_dashboard_my_schedule_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

