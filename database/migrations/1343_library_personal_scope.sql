-- Migration 1343: Library personal scope + folder sharing support

ALTER TABLE library_folders
  ADD COLUMN scope ENUM('organization', 'personal')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'organization'
    COMMENT 'organization = shared with agency; personal = owner private unless shared'
    AFTER owner_user_id;

ALTER TABLE library_resources
  ADD COLUMN scope ENUM('organization', 'personal')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'organization'
    COMMENT 'organization = shared with agency; personal = owner private unless shared'
    AFTER owner_user_id;

ALTER TABLE library_folders
  ADD KEY idx_library_folders_scope_owner (agency_id, scope, owner_user_id);

ALTER TABLE library_resources
  ADD KEY idx_library_resources_scope_owner (agency_id, scope, owner_user_id);
