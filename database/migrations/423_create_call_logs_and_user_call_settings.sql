-- Migration: Voice calling foundation (call logs + per-user call settings)

CREATE TABLE IF NOT EXISTS user_call_settings (
    user_id INT PRIMARY KEY,
    inbound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    outbound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    forward_to_phone VARCHAR(20) NULL,
    allow_call_recording BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_call_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS call_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL,
    number_id INT NULL,
    user_id INT NULL,
    client_id INT NULL,
    direction ENUM('INBOUND','OUTBOUND') NOT NULL,
    from_number VARCHAR(20) NULL,
    to_number VARCHAR(20) NULL,
    target_phone VARCHAR(20) NULL,
    twilio_call_sid VARCHAR(64) NULL,
    parent_call_sid VARCHAR(64) NULL,
    status VARCHAR(40) NULL,
    duration_seconds INT NULL,
    started_at TIMESTAMP NULL,
    answered_at TIMESTAMP NULL,
    ended_at TIMESTAMP NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_call_logs_sid (twilio_call_sid),
    INDEX idx_call_logs_agency_created (agency_id, created_at),
    INDEX idx_call_logs_user_created (user_id, created_at),
    INDEX idx_call_logs_client_created (client_id, created_at),
    INDEX idx_call_logs_status (status),
    CONSTRAINT fk_call_logs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_logs_number FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_logs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

