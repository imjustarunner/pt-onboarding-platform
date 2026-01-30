-- Migration: Per-user chat thread deletes (delete thread for me)
-- Description: Allow users to hide an entire platform chat thread from their view.
-- Notes:
-- - We treat this as a "hide until reopened / until new message arrives" behavior.
-- - New messages after deleted_at should cause the thread to reappear in listings.

CREATE TABLE IF NOT EXISTS chat_thread_deletes (
  thread_id INT NOT NULL,
  user_id INT NOT NULL,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_thread (user_id, thread_id),
  INDEX idx_thread_deleted_at (thread_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

