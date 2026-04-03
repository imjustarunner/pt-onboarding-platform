-- User Photos: profile album, source tracking, and manager moderation
-- Photos can be uploaded directly, or auto-linked from workout screenshots / workout media.
-- The profile photo is tracked on users.profile_photo_path (existing column).
-- This table stores the full album and moderation state.

CREATE TABLE IF NOT EXISTS user_photos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL COMMENT 'Owner of the photo',
  agency_id     INT NULL COMMENT 'Club context (NULL = platform-level)',
  file_path     VARCHAR(1024) NOT NULL COMMENT 'Stored path, e.g. uploads/user_photos/...',
  caption       VARCHAR(512) NULL,
  is_profile    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = currently set as profile/avatar photo',
  source        ENUM('direct_upload','workout_screenshot','workout_media') NOT NULL DEFAULT 'direct_upload',
  source_ref_id INT NULL COMMENT 'FK to challenge_workouts.id or challenge_workout_media.id',
  is_flagged    TINYINT(1) NOT NULL DEFAULT 0,
  flagged_by    INT NULL COMMENT 'user_id of manager who flagged',
  flagged_reason VARCHAR(512) NULL,
  flagged_at    DATETIME NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = soft-deleted',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_up_user      (user_id),
  INDEX idx_up_agency    (agency_id),
  INDEX idx_up_source    (source, source_ref_id),
  INDEX idx_up_active    (user_id, is_active),

  CONSTRAINT fk_up_user   FOREIGN KEY (user_id)   REFERENCES users(id)     ON DELETE CASCADE,
  CONSTRAINT fk_up_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)  ON DELETE SET NULL,
  CONSTRAINT fk_up_flagger FOREIGN KEY (flagged_by) REFERENCES users(id)   ON DELETE SET NULL
);
