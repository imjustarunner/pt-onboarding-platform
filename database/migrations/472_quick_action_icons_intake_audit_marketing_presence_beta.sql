-- Migration: Add missing Quick Action icon fields for platform and agencies
-- Description: Wire Intake Links, Audit Center, Marketing/Social, Presence, and Beta Feedback icons
-- so all Quick Action cards can be customized via branding (platform and agency).
-- Note: No FK constraints to avoid hitting MySQL's 64-key-per-table limit (icons table refs are enforced in app logic).

-- Platform branding
ALTER TABLE platform_branding
  ADD COLUMN intake_links_icon_id INT NULL,
  ADD COLUMN audit_center_icon_id INT NULL,
  ADD COLUMN marketing_social_icon_id INT NULL,
  ADD COLUMN presence_icon_id INT NULL,
  ADD COLUMN beta_feedback_icon_id INT NULL;

-- Agencies (agency admin dashboard quick actions)
ALTER TABLE agencies
  ADD COLUMN intake_links_icon_id INT NULL,
  ADD COLUMN audit_center_icon_id INT NULL,
  ADD COLUMN marketing_social_icon_id INT NULL;
