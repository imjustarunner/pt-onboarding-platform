-- Migration: Add signature coordinate fields to document_templates
-- Description: Allow admins to specify where signatures should be placed on documents

ALTER TABLE document_templates
  ADD COLUMN signature_x DECIMAL(10, 2) NULL COMMENT 'X coordinate for signature placement (in points, 72 per inch)',
  ADD COLUMN signature_y DECIMAL(10, 2) NULL COMMENT 'Y coordinate for signature placement (in points, 72 per inch)',
  ADD COLUMN signature_width DECIMAL(10, 2) NULL COMMENT 'Width of signature field (in points)',
  ADD COLUMN signature_height DECIMAL(10, 2) NULL COMMENT 'Height of signature field (in points)',
  ADD COLUMN signature_page INT NULL COMMENT 'Page number where signature should be placed (NULL = last page)';

