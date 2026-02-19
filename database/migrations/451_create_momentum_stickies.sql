-- Migration: Create momentum_stickies and momentum_sticky_entries tables
-- Purpose: ADHD-friendly post-it notes (Momentum Stickies) per user

CREATE TABLE IF NOT EXISTS momentum_stickies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  is_collapsed BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_momentum_stickies_user (user_id)
);

CREATE TABLE IF NOT EXISTS momentum_sticky_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  momentum_sticky_id INT NOT NULL,
  text TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT FALSE,
  is_expanded BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (momentum_sticky_id) REFERENCES momentum_stickies(id) ON DELETE CASCADE,
  INDEX idx_momentum_sticky_entries_sticky (momentum_sticky_id)
);
