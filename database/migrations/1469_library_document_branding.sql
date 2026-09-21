-- Preserve existing unbranded documents while allowing printable-page branding.
ALTER TABLE library_resources
  ADD COLUMN branding_mode ENUM('plain', 'organization', 'letterhead') NOT NULL DEFAULT 'plain'
  AFTER letterhead_template_id;

UPDATE library_resources SET branding_mode = 'letterhead'
WHERE letterhead_template_id IS NOT NULL;
