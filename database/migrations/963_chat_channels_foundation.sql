-- Migration 963: Channels foundation on chat_threads
-- Reuses chat_messages / participants / reads. thread_type = 'channel'.

ALTER TABLE chat_threads
  ADD COLUMN name VARCHAR(120) NULL
    COMMENT 'Display name for channel threads'
    AFTER thread_type,
  ADD COLUMN slug VARCHAR(120) NULL
    COMMENT 'URL-safe key unique within agency for channels'
    AFTER name,
  ADD COLUMN description VARCHAR(500) NULL
    COMMENT 'Optional channel purpose'
    AFTER slug,
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    COMMENT 'public|private — join rules for channels'
    AFTER description,
  ADD COLUMN created_by_user_id INT NULL
    COMMENT 'User who created the channel (null for system auto-channels)'
    AFTER visibility,
  ADD COLUMN archived_at TIMESTAMP NULL
    COMMENT 'Soft-archive; messages retained'
    AFTER created_by_user_id;

ALTER TABLE chat_threads
  ADD INDEX idx_chat_threads_agency_type_slug (agency_id, thread_type, slug),
  ADD CONSTRAINT fk_chat_threads_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
