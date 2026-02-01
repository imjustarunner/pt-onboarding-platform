-- Migration: Add "My Dashboard" Clients card icon fields to platform_branding and agencies
-- Description: Allow per-organization customization of the provider Clients dashboard card icon.

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_clients_icon_id INT NULL;

-- Organization overrides
ALTER TABLE agencies
  ADD COLUMN my_dashboard_clients_icon_id INT NULL;

