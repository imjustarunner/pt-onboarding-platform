-- Migration: Add user profile photo path
-- Description: Store a user-uploaded profile photo (GCS key) for providers and other users.

ALTER TABLE users
  ADD COLUMN profile_photo_path VARCHAR(500) NULL COMMENT 'GCS key/path for user profile photo (e.g., uploads/user_photos/user-123.png)';

CREATE INDEX idx_users_profile_photo_path ON users(profile_photo_path);

