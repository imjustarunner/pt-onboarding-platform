-- Administrative archives retain every clinical, scheduling and billing record.
-- Resource IDs in the clinical plane deliberately have no cross-database FK.
CREATE TABLE IF NOT EXISTS clinical_work_archives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NULL,
  archived_by_user_id INT NOT NULL,
  archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reason VARCHAR(2000) NOT NULL,
  summary_json JSON NOT NULL,
  restored_by_user_id INT NULL,
  restored_at DATETIME(3) NULL,
  restore_reason VARCHAR(2000) NULL,
  INDEX idx_cwa_agency_active (agency_id, restored_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_work_archive_resources (
  archive_id BIGINT UNSIGNED NOT NULL,
  resource_type VARCHAR(40) NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (archive_id, resource_type, resource_id),
  INDEX idx_cwar_resource (resource_type, resource_id, archive_id),
  CONSTRAINT fk_cwar_archive FOREIGN KEY (archive_id) REFERENCES clinical_work_archives(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
