-- Migration 1409: Library branded_doc type + body/letterhead columns
ALTER TABLE library_resources
  MODIFY COLUMN resource_type ENUM(
    'file',
    'link',
    'google_doc',
    'folder',
    'branded_doc'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'file';

ALTER TABLE library_resources
  ADD COLUMN body_html MEDIUMTEXT NULL
    COMMENT 'Editable HTML body for branded_doc resources'
    AFTER external_url,
  ADD COLUMN letterhead_template_id INT UNSIGNED NULL
    COMMENT 'Letterhead used when viewing/printing branded_doc'
    AFTER body_html;
