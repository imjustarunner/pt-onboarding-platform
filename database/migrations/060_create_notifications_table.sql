-- Migration: Create notifications table
-- Description: Create table for storing notifications about expirations, overdue items, and onboarding completions

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('status_expired', 'temp_password_expired', 'task_overdue', 'onboarding_completed', 'invitation_expired') NOT NULL,
    severity ENUM('info', 'warning', 'urgent') DEFAULT 'warning',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    user_id INT NULL COMMENT 'User the notification is about',
    agency_id INT NOT NULL COMMENT 'Agency context',
    related_entity_type VARCHAR(50) NULL COMMENT 'user, task, document, etc.',
    related_entity_id INT NULL COMMENT 'ID of related entity',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    read_by_user_id INT NULL COMMENT 'User who marked as read',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (read_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_agency_id (agency_id),
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_is_read (is_read),
    INDEX idx_is_resolved (is_resolved),
    INDEX idx_created_at (created_at),
    INDEX idx_agency_read (agency_id, is_read),
    INDEX idx_agency_resolved (agency_id, is_resolved)
);
