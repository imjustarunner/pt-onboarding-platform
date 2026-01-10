-- Migration: Update modules table for tracks and enhancements
-- Description: Add track support, estimated time, visual style, assignment level

ALTER TABLE modules
ADD COLUMN track_id INT NULL AFTER description,
ADD COLUMN estimated_time_minutes INT DEFAULT 0 AFTER order_index,
ADD COLUMN visual_style JSON AFTER estimated_time_minutes,
ADD COLUMN assignment_level ENUM('platform', 'agency', 'role') DEFAULT 'platform' AFTER visual_style,
ADD FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD INDEX idx_track (track_id),
ADD INDEX idx_assignment_level (assignment_level);

-- Update module_content to support acknowledgments
ALTER TABLE module_content
MODIFY COLUMN content_type ENUM('video', 'slide', 'quiz', 'acknowledgment', 'text') NOT NULL;

-- Update user_progress to add stage and program_id
ALTER TABLE user_progress
ADD COLUMN stage ENUM('pre-hire', 'onboarding', 'ongoing') DEFAULT 'onboarding' AFTER status,
ADD COLUMN program_id INT NULL AFTER module_id,
ADD FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
ADD INDEX idx_stage (stage),
ADD INDEX idx_program (program_id);

