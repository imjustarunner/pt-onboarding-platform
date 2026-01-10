-- Migration: Add module response answers storage
-- Description: Add table to store user responses to text/response page questions in modules

-- Module response answers table
CREATE TABLE IF NOT EXISTS module_response_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    content_id INT NOT NULL COMMENT 'Reference to module_content.id',
    response_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES module_content(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_content_response (user_id, content_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_content (content_id)
);

