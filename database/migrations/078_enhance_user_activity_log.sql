-- Migration: Enhance user activity log table
-- Description: Add new action types and fields to track module activities, password changes, and durations

-- Add new action types to the enum
ALTER TABLE user_activity_log
MODIFY COLUMN action_type ENUM(
    'login', 
    'logout', 
    'timeout', 
    'page_view', 
    'api_call',
    'password_change',
    'module_start',
    'module_end',
    'module_complete',
    'page_navigation'
) NOT NULL;

-- Add duration_seconds field to track time spent for timed activities
ALTER TABLE user_activity_log
ADD COLUMN duration_seconds INT NULL COMMENT 'Duration in seconds for timed activities (e.g., session duration, module time)';

-- Add module_id field to track module-specific activities
ALTER TABLE user_activity_log
ADD COLUMN module_id INT NULL COMMENT 'Module ID for module-related activities',
ADD FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
ADD INDEX idx_module_id (module_id);
