-- Migration 1267: Provider Update attach Admin Update + Handbook Updates digests

ALTER TABLE provider_update_pushes
  ADD COLUMN attached_admin_update_id INT NULL DEFAULT NULL
    COMMENT 'Admin Update attached to this push (e.g. August 2026)',
  ADD CONSTRAINT fk_pu_pushes_admin_update
    FOREIGN KEY (attached_admin_update_id) REFERENCES admin_updates(id) ON DELETE SET NULL;

ALTER TABLE workplace_handbook_documents
  ADD COLUMN full_handbook_url VARCHAR(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Google Doc (or other) link to the full handbook — not in-app';

CREATE TABLE IF NOT EXISTS workplace_handbook_digests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Handbook Updates',
  period_label VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'e.g. August 2026',
  admin_update_id INT NULL DEFAULT NULL,
  provider_update_push_id INT NULL DEFAULT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL DEFAULT NULL,
  published_by_user_id INT NULL DEFAULT NULL,
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wh_digest_agency (agency_id, status),
  INDEX idx_wh_digest_admin_update (admin_update_id),
  CONSTRAINT fk_wh_digest_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_digest_admin_update
    FOREIGN KEY (admin_update_id) REFERENCES admin_updates(id) ON DELETE SET NULL,
  CONSTRAINT fk_wh_digest_push
    FOREIGN KEY (provider_update_push_id) REFERENCES provider_update_pushes(id) ON DELETE SET NULL,
  CONSTRAINT fk_wh_digest_published_by
    FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_digest_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  digest_id INT NOT NULL,
  agency_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  subject VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  rationale TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  changed_content MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wh_digest_entries (digest_id, sort_order),
  CONSTRAINT fk_wh_digest_entry_digest
    FOREIGN KEY (digest_id) REFERENCES workplace_handbook_digests(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_digest_entry_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
