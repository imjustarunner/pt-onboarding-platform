-- Club-wide feed posts (not tied to a season); optional public visibility when manager enables public feed.

CREATE TABLE IF NOT EXISTS club_feed_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  message_text TEXT NOT NULL,
  visibility ENUM('club', 'public') NOT NULL DEFAULT 'club',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_club_feed_posts_agency_created (agency_id, created_at),
  INDEX idx_club_feed_posts_agency_public (agency_id, visibility, created_at),
  CONSTRAINT fk_club_feed_posts_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_feed_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
