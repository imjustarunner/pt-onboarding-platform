-- Migration: client note read tracking
-- Description: Track per-user read position for client note threads (unread bubbles).

CREATE TABLE IF NOT EXISTS client_note_reads (
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, user_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_client (client_id)
);

