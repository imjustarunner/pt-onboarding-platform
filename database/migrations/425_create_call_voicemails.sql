-- Migration: call voicemail recordings and inbox metadata

CREATE TABLE IF NOT EXISTS call_voicemails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_log_id INT NULL,
    agency_id INT NULL,
    user_id INT NULL,
    client_id INT NULL,
    from_number VARCHAR(20) NULL,
    to_number VARCHAR(20) NULL,
    twilio_recording_sid VARCHAR(64) NOT NULL,
    recording_url VARCHAR(255) NULL,
    duration_seconds INT NULL,
    status VARCHAR(40) NULL,
    transcription_text TEXT NULL,
    listened_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_call_voicemails_recording_sid (twilio_recording_sid),
    INDEX idx_call_voicemails_agency_created (agency_id, created_at),
    INDEX idx_call_voicemails_user_created (user_id, created_at),
    INDEX idx_call_voicemails_call_log (call_log_id),
    CONSTRAINT fk_call_voicemails_call_log FOREIGN KEY (call_log_id) REFERENCES call_logs(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_voicemails_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_voicemails_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_call_voicemails_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

