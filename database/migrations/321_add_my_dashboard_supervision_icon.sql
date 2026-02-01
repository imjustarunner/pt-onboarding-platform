-- Migration: My Dashboard Supervision card icon (for supervisors)

-- Platform default
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_supervision_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_my_dashboard_supervision_icon FOREIGN KEY (my_dashboard_supervision_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Organization overrides: column only, no FK on agencies (MySQL 64-key limit)
ALTER TABLE agencies
  ADD COLUMN my_dashboard_supervision_icon_id INT NULL;
