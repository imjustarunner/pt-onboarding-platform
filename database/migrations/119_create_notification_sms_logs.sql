-- Migration: Create notification_sms_logs table
-- Description: Track outbound SMS sends triggered by in-app notifications (user-directed only).

CREATE TABLE IF NOT EXISTS notification_sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    agency_id INT NOT NULL,
    notification_id INT NULL,
    to_number VARCHAR(32) NOT NULL,
    from_number VARCHAR(32) NOT NULL,
    body TEXT NOT NULL,
    twilio_sid VARCHAR(64) NULL,
    status ENUM('pending','sent','failed') DEFAULT 'pending',
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL,
    INDEX idx_smslog_user_created (user_id, created_at),
    INDEX idx_smslog_agency_created (agency_id, created_at),
    INDEX idx_smslog_notification (notification_id),
    INDEX idx_smslog_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

