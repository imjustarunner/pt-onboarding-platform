-- Add document_action_type column to tasks table
ALTER TABLE tasks 
ADD COLUMN document_action_type ENUM('signature', 'review') 
DEFAULT 'signature' 
AFTER task_type;

-- Update existing document tasks to have 'signature' type
UPDATE tasks 
SET document_action_type = 'signature' 
WHERE task_type = 'document' AND document_action_type IS NULL;

-- Create document_acknowledgments table
CREATE TABLE IF NOT EXISTS document_acknowledgments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_task_user (task_id, user_id)
);

