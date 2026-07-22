-- Migration 1026: Expand module_content for multi-block lessons + draft/publish on modules
-- Converts content_type from a narrow ENUM to VARCHAR so new block types can ship without
-- repeated ENUM ALTER migrations. Adds title/settings columns and modules.publish_status.

-- 1) Widen content_type to support the block library (video, text, image, pdf, quiz, etc.)
ALTER TABLE module_content
  MODIFY COLUMN content_type VARCHAR(64) NOT NULL;

-- 2) Optional display title for a block (falls back to content_data.title when null)
ALTER TABLE module_content
  ADD COLUMN title VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Optional block title shown in outlines and builder'
  AFTER content_type;

-- 3) Block-level settings (required, shuffle, feedback, etc.)
ALTER TABLE module_content
  ADD COLUMN settings JSON NULL
  COMMENT 'Block settings: required, shuffleOptions, feedback, explanation, etc.'
  AFTER content_data;

-- 4) Draft / published workflow for lessons (modules)
ALTER TABLE modules
  ADD COLUMN publish_status ENUM('draft', 'published') NOT NULL DEFAULT 'published'
  COMMENT 'draft = editable WIP; published = available to learners when also active'
  AFTER is_active;

-- Existing active modules stay published; inactive modules become draft so Publish is meaningful
UPDATE modules
SET publish_status = 'draft'
WHERE is_active = FALSE;
