-- Migration 1378: staff HTML email signature active flag (replaces image-upload workflow)
ALTER TABLE users
  ADD COLUMN email_signature_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'When 1, append tenant HTML staff signature on provider Hub/outbound email'
    AFTER email_signature_path;
