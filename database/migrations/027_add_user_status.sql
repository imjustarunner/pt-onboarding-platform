-- Migration: Add user status fields for completion/termination tracking
-- Description: Add status tracking and 7-day expiration for completed/terminated users

ALTER TABLE users
ADD COLUMN status ENUM('active', 'completed', 'terminated') DEFAULT 'active' AFTER role,
ADD COLUMN completed_at TIMESTAMP NULL AFTER status,
ADD COLUMN terminated_at TIMESTAMP NULL AFTER completed_at,
ADD COLUMN status_expires_at TIMESTAMP NULL AFTER terminated_at;

CREATE INDEX idx_user_status ON users(status);
CREATE INDEX idx_status_expires_at ON users(status_expires_at);

