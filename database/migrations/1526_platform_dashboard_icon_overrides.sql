-- Per-card platform overrides for the same inline editor used by tenants.
-- Separate from agency theme settings and from legacy global icon assignments.
ALTER TABLE platform_branding
  ADD COLUMN dashboard_icon_overrides JSON NULL
  COMMENT 'Inline dashboard/admin icon assignments keyed by card ID';
