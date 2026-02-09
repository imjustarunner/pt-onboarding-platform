-- Add language_code to intake_links for multi-language portals.

ALTER TABLE intake_links
  ADD COLUMN language_code VARCHAR(10) NULL DEFAULT 'en' AFTER description;

-- Add language code to intake links (English/Spanish support)
ALTER TABLE intake_links
  ADD COLUMN language_code VARCHAR(8) NULL DEFAULT 'en' AFTER description;
