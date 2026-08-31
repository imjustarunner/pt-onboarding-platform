-- Migration 1346: Library distribute modes (source copies + distribution audit)

ALTER TABLE library_resources
  ADD COLUMN source_resource_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Master Library resource this personal copy was created from'
    AFTER owner_user_id;

ALTER TABLE library_resources
  ADD KEY idx_library_resources_source (source_resource_id),
  ADD KEY idx_library_resources_source_owner (agency_id, source_resource_id, owner_user_id);

ALTER TABLE library_resources
  ADD CONSTRAINT fk_library_resources_source
    FOREIGN KEY (source_resource_id) REFERENCES library_resources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS library_distributions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  source_resource_id INT UNSIGNED NOT NULL,
  mode ENUM('view_only', 'collaborate', 'personal_copy')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_by INT NULL DEFAULT NULL,
  recipient_user_id INT NOT NULL,
  created_resource_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Personal copy resource id when mode=personal_copy',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_library_distributions_agency (agency_id),
  KEY idx_library_distributions_source (source_resource_id),
  KEY idx_library_distributions_recipient (recipient_user_id),
  CONSTRAINT fk_library_distributions_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_distributions_source FOREIGN KEY (source_resource_id) REFERENCES library_resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_distributions_created FOREIGN KEY (created_resource_id) REFERENCES library_resources(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
