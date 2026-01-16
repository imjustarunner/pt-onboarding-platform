-- Migration: Platform chat + presence
-- Description:
-- 1) user_presence: tracks last heartbeat + last activity per user (current agency context)
-- 2) chat_threads / participants / messages / reads: direct-message chat within an agency

CREATE TABLE IF NOT EXISTS user_presence (
  user_id INT NOT NULL PRIMARY KEY,
  agency_id INT NULL,
  last_heartbeat_at TIMESTAMP NULL,
  last_activity_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  INDEX idx_agency_last_heartbeat (agency_id, last_heartbeat_at),
  INDEX idx_last_activity (last_activity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  thread_type VARCHAR(50) NOT NULL DEFAULT 'direct',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency_updated (agency_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_thread_participants (
  thread_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_threads (user_id, thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  thread_id INT NOT NULL,
  sender_user_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_thread_created (thread_id, created_at),
  INDEX idx_thread_id_id (thread_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_thread_reads (
  thread_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_message_id INT NULL,
  last_read_at TIMESTAMP NULL,
  last_notified_message_id INT NULL,
  last_notified_at TIMESTAMP NULL,
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_reads (user_id, thread_id),
  INDEX idx_thread_reads (thread_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

