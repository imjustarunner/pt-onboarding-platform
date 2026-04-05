-- Per-user read state for club feed posts (club_feed_posts).

CREATE TABLE IF NOT EXISTS club_feed_post_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_club_feed_post_read_user_post (user_id, post_id),
  INDEX idx_club_feed_post_read_post (post_id),
  CONSTRAINT fk_club_feed_post_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_feed_post_read_post FOREIGN KEY (post_id) REFERENCES club_feed_posts(id) ON DELETE CASCADE
);
