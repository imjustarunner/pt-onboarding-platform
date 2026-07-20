-- Migration 1009: Fullscreen platform load art for HQ route transitions
ALTER TABLE platform_branding
  ADD COLUMN platform_fullscreen_load_icon_id INT NULL
  COMMENT 'Fullscreen image shown during platform-level loading / HQ route swaps';

UPDATE platform_branding pb
INNER JOIN (
  SELECT id
  FROM icons
  WHERE agency_id IS NULL
    AND LOWER(REPLACE(REPLACE(REPLACE(name, ' ', ''), '_', ''), '-', '')) IN (
      'fullscreenloadplatform',
      'platformfullscreenload',
      'fullscreenplatformload'
    )
  ORDER BY id DESC
  LIMIT 1
) i ON 1 = 1
SET pb.platform_fullscreen_load_icon_id = i.id
WHERE pb.platform_fullscreen_load_icon_id IS NULL;
