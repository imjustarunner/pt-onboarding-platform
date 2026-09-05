-- Migration 1376: per-user email signature image for Hub / personal outbound
ALTER TABLE users
  ADD COLUMN email_signature_path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Stored path to personal email signature image (PNG/JPG)'
    AFTER profile_photo_path;
