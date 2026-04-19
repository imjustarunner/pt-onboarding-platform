-- Migration: file/image/gif/video attachments on platform chat_messages
--
-- file_path is a server-relative path under /uploads (same convention used by
-- comment-attachment / workout-attachment). file_kind classifies the
-- attachment so the UI can choose the right renderer (inline image vs. file
-- chip vs. video player).

CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  file_kind VARCHAR(16) NOT NULL DEFAULT 'file',
  width INT NULL,
  height INT NULL,
  byte_size BIGINT NULL,
  original_filename VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_msg_attachments_message (message_id),
  CONSTRAINT fk_chat_msg_attachments_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
