-- Migration 1229: optional supporting document on mileage claims (Other Mileage)
ALTER TABLE payroll_mileage_claims
  ADD COLUMN attachment_file_path VARCHAR(512) NULL DEFAULT NULL
    COMMENT 'Optional supporting document path (map, approval email, etc.)',
  ADD COLUMN attachment_original_name VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Original filename of the mileage attachment',
  ADD COLUMN attachment_mime_type VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'MIME type of the mileage attachment',
  ADD COLUMN attachment_size_bytes INT NULL DEFAULT NULL
    COMMENT 'Size in bytes of the mileage attachment';
