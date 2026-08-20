-- Migration 1260: per-school packet content-version log
-- Tracks auto-incrementing version labels (1.0, 1.01, 1.02…) for each school's
-- printed packet whenever its content hash changes (roster or template edit).
-- The version label is printed in the packet footer so clients who signed a
-- paper packet can be matched to the exact provider list shown on that version.

CREATE TABLE school_packet_org_versions (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT          NOT NULL,
  locale                 VARCHAR(8)   NOT NULL DEFAULT 'en' COLLATE utf8mb4_unicode_ci,
  version_major          INT          NOT NULL DEFAULT 1,
  version_minor          INT          NOT NULL DEFAULT 0,
  version_label          VARCHAR(32)  NOT NULL COLLATE utf8mb4_unicode_ci
                           COMMENT '1.0  1.01  1.02 … printed in the packet footer',
  content_hash           CHAR(64)     NOT NULL COLLATE utf8mb4_unicode_ci
                           COMMENT 'SHA-256 of staff IDs + provider IDs + template version',
  change_reason          VARCHAR(100) NULL DEFAULT NULL COLLATE utf8mb4_unicode_ci
                           COMMENT 'provider_added, staff_added, template_edited, etc.',
  storage_path           VARCHAR(512) NULL DEFAULT NULL COLLATE utf8mb4_unicode_ci
                           COMMENT 'GCS path for the cached PDF snapshot of this version',
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_spov_org_locale_hash   (school_organization_id, locale, content_hash),
  KEY idx_spov_org_locale_seq          (school_organization_id, locale, version_major, version_minor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
