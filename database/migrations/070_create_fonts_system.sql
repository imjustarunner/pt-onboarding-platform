-- Migration: Create fonts management system
-- Description: Add fonts table and update platform_branding to use font_id references

-- Create fonts table
CREATE TABLE IF NOT EXISTS fonts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  family_name VARCHAR(255) NOT NULL COMMENT 'CSS font-family name',
  file_path VARCHAR(500) NOT NULL COMMENT 'Path to font file (woff2, woff, ttf)',
  file_type ENUM('woff2', 'woff', 'ttf', 'otf') NOT NULL,
  agency_id INT NULL COMMENT 'NULL for platform fonts, agency_id for agency-specific fonts',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency (agency_id),
  INDEX idx_active (is_active),
  INDEX idx_family_name (family_name)
);

-- Add font_id columns to platform_branding (keeping old columns for migration)
ALTER TABLE platform_branding
  ADD COLUMN header_font_id INT NULL AFTER header_font,
  ADD COLUMN body_font_id INT NULL AFTER body_font,
  ADD COLUMN numeric_font_id INT NULL AFTER numeric_font,
  ADD COLUMN display_font_id INT NULL AFTER display_font,
  ADD FOREIGN KEY (header_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (body_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (numeric_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (display_font_id) REFERENCES fonts(id) ON DELETE SET NULL;

-- Insert default fonts (Comfortaa and Montserrat)
-- Note: These will need actual font files uploaded, but we create the records
INSERT INTO fonts (name, family_name, file_path, file_type, agency_id, is_active) VALUES
  ('Comfortaa Regular', 'Comfortaa', '/fonts/comfortaa-regular.woff2', 'woff2', NULL, TRUE),
  ('Comfortaa Bold', 'Comfortaa', '/fonts/comfortaa-bold.woff2', 'woff2', NULL, TRUE),
  ('Montserrat Regular', 'Montserrat', '/fonts/montserrat-regular.woff2', 'woff2', NULL, TRUE),
  ('Montserrat Bold', 'Montserrat', '/fonts/montserrat-bold.woff2', 'woff2', NULL, TRUE),
  ('Inter Regular', 'Inter', '/fonts/inter-regular.woff2', 'woff2', NULL, TRUE),
  ('Source Sans 3 Regular', 'Source Sans 3', '/fonts/source-sans-3-regular.woff2', 'woff2', NULL, TRUE),
  ('IBM Plex Mono Regular', 'IBM Plex Mono', '/fonts/ibm-plex-mono-regular.woff2', 'woff2', NULL, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);
