-- Migration 889: Encrypted retroactive attachments for lifecycle checklist items
-- Allows HR to upload compliance documents (W-4, I-9, etc.) when not captured during pre-hire.

ALTER TABLE user_lifecycle_checklist_items
  ADD COLUMN attachment_storage_path VARCHAR(500) NULL COMMENT 'Private GCS key; never served via /uploads',
  ADD COLUMN attachment_original_name VARCHAR(255) NULL,
  ADD COLUMN attachment_mime_type VARCHAR(100) NULL,
  ADD COLUMN attachment_uploaded_at DATETIME NULL,
  ADD COLUMN attachment_uploaded_by_user_id INT NULL,
  ADD COLUMN attachment_is_encrypted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN attachment_encryption_key_id VARCHAR(255) NULL,
  ADD COLUMN attachment_encryption_wrapped_key_b64 TEXT NULL,
  ADD COLUMN attachment_encryption_iv_b64 VARCHAR(64) NULL,
  ADD COLUMN attachment_encryption_auth_tag_b64 VARCHAR(64) NULL,
  ADD COLUMN attachment_encryption_alg VARCHAR(32) NULL,
  ADD COLUMN attachment_encryption_aad TEXT NULL;
