-- Migration: Create message logs and auto-reply throttle
-- Description: Twilio inbound/outbound message persistence + loop breaker for auto-responders.

CREATE TABLE IF NOT EXISTS message_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL,
    user_id INT NOT NULL COMMENT 'Owning clinician/staff user for masked number',
    client_id INT NULL,
    direction ENUM('INBOUND','OUTBOUND') NOT NULL,
    body TEXT NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    twilio_message_sid VARCHAR(64) NULL,
    delivery_status ENUM('received','pending','sent','failed') DEFAULT 'received',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    INDEX idx_message_agency_created (agency_id, created_at),
    INDEX idx_message_user_created (user_id, created_at),
    INDEX idx_message_client_created (client_id, created_at),
    INDEX idx_message_direction_created (direction, created_at),
    INDEX idx_message_to_number (to_number),
    INDEX idx_message_from_number (from_number),
    INDEX idx_message_twilio_sid (twilio_message_sid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_auto_reply_throttle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_client_phone (user_id, client_phone),
    INDEX idx_autoreply_last_sent (last_sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

