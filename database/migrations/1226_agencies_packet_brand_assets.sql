-- Migration 1226: Agency printable-packet brand assets (non-ITSCO chrome)
ALTER TABLE agencies
  ADD COLUMN packet_cover_path VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'GCS path for office/school packet cover page image',
  ADD COLUMN packet_logo_path VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'GCS path for packet header logo',
  ADD COLUMN packet_footer_logo_path VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'GCS path for packet footer mark/logo',
  ADD COLUMN packet_header_image_path VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'GCS path for optional packet header banner image',
  ADD COLUMN packet_version_label VARCHAR(32) NULL DEFAULT '1.0'
    COMMENT 'Printed packet version label (Impact footer); default 1.0 until launch';
