-- Migration: Add user tracks and admin audit log
-- Description: Support user-track assignments and track admin actions

-- Create user_tracks table for assigning users to tracks within agencies
CREATE TABLE IF NOT EXISTS user_tracks (
    user_id INT NOT NULL,
    track_id INT NOT NULL,
    agency_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by_user_id INT NULL,
    PRIMARY KEY (user_id, track_id, agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_track (track_id),
    INDEX idx_agency (agency_id),
    INDEX idx_user_agency (user_id, agency_id)
);

-- Create admin_audit_log table for tracking admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type ENUM('reset_module', 'reset_track', 'mark_module_complete', 'mark_track_complete') NOT NULL,
    actor_user_id INT NOT NULL,
    target_user_id INT NOT NULL,
    module_id INT NULL,
    track_id INT NULL,
    agency_id INT NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_actor (actor_user_id),
    INDEX idx_target (target_user_id),
    INDEX idx_agency (agency_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at)
);

-- Update user_progress table to add time_spent_seconds and override tracking
ALTER TABLE user_progress
ADD COLUMN time_spent_seconds INT DEFAULT 0 AFTER time_spent_minutes,
ADD COLUMN overridden_by_user_id INT NULL AFTER completed_at,
ADD COLUMN overridden_at TIMESTAMP NULL AFTER overridden_by_user_id,
ADD FOREIGN KEY (overridden_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
ADD INDEX idx_time_seconds (time_spent_seconds),
ADD INDEX idx_overridden (overridden_by_user_id);

