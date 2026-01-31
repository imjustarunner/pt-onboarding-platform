/*
Add dedicated dashboard action icon override slots for:
- Program Overview
- Provider Availability
- Executive Report

These are stored at both platform-level defaults (platform_branding) and per-org overrides (agencies),
matching existing quick-action icon patterns like school_overview_icon_id and external_calendar_audit_icon_id.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE agencies
  ADD COLUMN program_overview_icon_id INT NULL,
  ADD COLUMN provider_availability_dashboard_icon_id INT NULL,
  ADD COLUMN executive_report_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN program_overview_icon_id INT NULL,
  ADD COLUMN provider_availability_dashboard_icon_id INT NULL,
  ADD COLUMN executive_report_icon_id INT NULL;

