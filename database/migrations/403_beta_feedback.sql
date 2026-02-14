-- Beta Feedback: User-submitted screenshots and context for debugging
-- SuperAdmin can enable/disable via Platform Settings. When enabled, all users see a floating "Beta" widget.

-- Platform toggle (add to platform_branding)
ALTER TABLE platform_branding
  ADD COLUMN beta_feedback_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, all users see Beta feedback widget to report issues with screenshots.';

-- Beta feedback submissions table
CREATE TABLE IF NOT EXISTS beta_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  organization_id INT NULL,
  route_path VARCHAR(512) NULL COMMENT 'Vue Router full path when submitted',
  route_name VARCHAR(255) NULL COMMENT 'Vue Router route name',
  description TEXT NULL COMMENT 'What the user was doing / problem description',
  screenshot_path VARCHAR(512) NULL COMMENT 'GCS path to uploaded screenshot',
  user_agent VARCHAR(1024) NULL,
  viewport_width INT NULL,
  viewport_height INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_beta_feedback_user (user_id),
  INDEX idx_beta_feedback_created (created_at),
  INDEX idx_beta_feedback_agency (agency_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
