-- Migration 1008: Platform load icon for the small platform-level loading overlay
ALTER TABLE platform_branding
  ADD COLUMN platform_load_icon_id INT NULL
  COMMENT 'Icon shown in the small platform-level loading overlay';

-- Auto-wire a platform library icon named platformload / platform_load / Platform Load when present
UPDATE platform_branding pb
INNER JOIN (
  SELECT id
  FROM icons
  WHERE agency_id IS NULL
    AND LOWER(REPLACE(REPLACE(REPLACE(name, ' ', ''), '_', ''), '-', '')) IN (
      'platformload',
      'platformloading',
      'ptplatformload'
    )
  ORDER BY id DESC
  LIMIT 1
) i ON 1 = 1
SET pb.platform_load_icon_id = i.id
WHERE pb.platform_load_icon_id IS NULL;
