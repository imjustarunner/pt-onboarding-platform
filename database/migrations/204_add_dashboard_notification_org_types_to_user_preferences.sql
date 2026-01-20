-- Migration: Add dashboard_notification_org_types to user_preferences
-- Description: Persist per-user dashboard notification org-type scope (e.g. ["agency","program"])

ALTER TABLE user_preferences
  ADD COLUMN dashboard_notification_org_types JSON NULL
  AFTER default_landing_page;

