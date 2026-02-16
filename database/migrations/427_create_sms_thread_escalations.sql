-- Migration: SMS thread escalations/support takeover state

CREATE TABLE IF NOT EXISTS sms_thread_escalations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL,
    user_id INT NOT NULL,
    client_id INT NOT NULL,
    inbound_log_id INT NULL,
    escalated_to_phone VARCHAR(20) NULL,
    escalation_type ENUM('sla_timeout','provider_mirror') NOT NULL DEFAULT 'sla_timeout',
    thread_mode ENUM('respondable','read_only') NOT NULL DEFAULT 'respondable',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_sms_escalation_inbound (inbound_log_id),
    INDEX idx_sms_escalation_thread (user_id, client_id, is_active),
    INDEX idx_sms_escalation_agency (agency_id, created_at),
    CONSTRAINT fk_sms_escalation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sms_escalation_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_sms_escalation_log FOREIGN KEY (inbound_log_id) REFERENCES message_logs(id) ON DELETE SET NULL,
    CONSTRAINT fk_sms_escalation_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

