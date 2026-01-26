/*
Add icon slot for "External Calendar Audit" quick action.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE agencies
  ADD COLUMN external_calendar_audit_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN external_calendar_audit_icon_id INT NULL;

