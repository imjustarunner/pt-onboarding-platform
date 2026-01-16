-- Migration: Add chat icon fields (platform + agencies)
-- Description:
-- - Adds chat_icon_id to agencies so each agency can customize the left chat icon
-- - Adds chat_icon_id to platform_branding as the platform default/fallback

-- Platform branding: chat icon
ALTER TABLE platform_branding
  ADD COLUMN chat_icon_id INT NULL COMMENT 'Icon for platform chat entrypoint' AFTER communications_icon_id,
  ADD CONSTRAINT fk_platform_chat_icon FOREIGN KEY (chat_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Agencies: chat icon
ALTER TABLE agencies
  ADD COLUMN chat_icon_id INT NULL COMMENT 'Icon for agency chat entrypoint' AFTER settings_icon_id,
  ADD CONSTRAINT fk_agency_chat_icon FOREIGN KEY (chat_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

