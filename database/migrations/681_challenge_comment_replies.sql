-- Add threaded comment support: parent_comment_id allows replies to nest under a parent comment
ALTER TABLE challenge_workout_comments
  ADD COLUMN parent_comment_id INT NULL DEFAULT NULL AFTER comment_text,
  ADD INDEX idx_comments_parent (parent_comment_id);
