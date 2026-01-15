-- Migration: Create emergency broadcast tables
-- Description: Admin broadcast messages to users (SMS + future email) with throttling and delivery tracking.

CREATE TABLE IF NOT EXISTS emergency_broadcasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL COMMENT 'If NULL, treated as platform/global (super_admin only)',
    created_by_user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    channels JSON NULL COMMENT 'e.g., {\"sms\": true, \"email\": true}',
    filters JSON NULL COMMENT 'e.g., {\"roles\":[\"clinician\"],\"agencyIds\":[1]}',
    status ENUM('draft','sending','sent','failed') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_broadcast_agency_created (agency_id, created_at),
    INDEX idx_broadcast_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emergency_broadcast_recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    broadcast_id INT NOT NULL,
    user_id INT NOT NULL,
    channel ENUM('sms','email') NOT NULL,
    recipient_address VARCHAR(255) NULL,
    delivery_status ENUM('pending','sent','failed') DEFAULT 'pending',
    provider_message_id VARCHAR(64) NULL,
    error_message TEXT NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (broadcast_id) REFERENCES emergency_broadcasts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_broadcast_user_channel (broadcast_id, user_id, channel),
    INDEX idx_broadcast_recipient_status (broadcast_id, delivery_status),
    INDEX idx_recipient_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

