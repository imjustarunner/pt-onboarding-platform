-- Migration 691: Season banner image and logo/icon
ALTER TABLE learning_program_classes
  ADD COLUMN banner_image_path VARCHAR(512) NULL DEFAULT NULL AFTER season_announcement_text,
  ADD COLUMN banner_focal_x    DECIMAL(5,2) NOT NULL DEFAULT 50.00 COMMENT 'Horizontal focal point % (0-100)',
  ADD COLUMN banner_focal_y    DECIMAL(5,2) NOT NULL DEFAULT 50.00 COMMENT 'Vertical focal point % (0-100)',
  ADD COLUMN logo_image_path   VARCHAR(512) NULL DEFAULT NULL AFTER banner_focal_y;
