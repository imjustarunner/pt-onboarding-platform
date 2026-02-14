-- Beta Feedback: Add status for filtering and workflow
ALTER TABLE beta_feedback
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'
  COMMENT 'pending, reviewed, resolved'
  AFTER viewport_height,
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER status,
  ADD COLUMN reviewed_by_user_id INT NULL AFTER reviewed_at,
  ADD INDEX idx_beta_feedback_status (status);
