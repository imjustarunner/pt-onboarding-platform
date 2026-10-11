-- Structured handbook content and traceable, automatically generated updates.
ALTER TABLE workplace_handbook_versions
  ADD COLUMN source_revision VARCHAR(64) NULL,
  ADD COLUMN metadata_json JSON NULL;

ALTER TABLE workplace_handbook_sections
  ADD COLUMN parent_slug VARCHAR(128) NULL,
  ADD COLUMN source_page INT NULL,
  ADD COLUMN source_body_hash VARCHAR(64) NULL,
  ADD COLUMN content_status ENUM('pending', 'ready') NOT NULL DEFAULT 'ready';

ALTER TABLE workplace_handbook_digest_entries
  ADD COLUMN handbook_section_slug VARCHAR(128) NULL,
  ADD COLUMN handbook_version_id INT NULL,
  ADD COLUMN change_kind VARCHAR(32) NULL,
  ADD COLUMN previous_content MEDIUMTEXT NULL,
  ADD UNIQUE KEY uq_wh_generated_change (digest_id, handbook_version_id, handbook_section_slug),
  ADD CONSTRAINT fk_wh_digest_entry_version
    FOREIGN KEY (handbook_version_id) REFERENCES workplace_handbook_versions(id) ON DELETE RESTRICT;
