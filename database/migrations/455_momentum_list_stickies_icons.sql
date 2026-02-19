-- Migration: Momentum List and Momentum Stickies icon branding
-- Description: Allow agencies to customize icons for Momentum List card and Momentum Stickies overlay.
--
-- IMPORTANT: platform_branding and agencies can hit MySQL's 64-key limit. Add columns only, no FKs.

-- Platform defaults: column only (no FK)
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_momentum_list_icon_id INT NULL,
  ADD COLUMN my_dashboard_momentum_stickies_icon_id INT NULL;

-- Organization overrides: column only (no FK)
ALTER TABLE agencies
  ADD COLUMN my_dashboard_momentum_list_icon_id INT NULL,
  ADD COLUMN my_dashboard_momentum_stickies_icon_id INT NULL;
