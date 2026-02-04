-- Migration: Twilio numbers, assignments, rules, and opt-in state
-- Description: Supports agency pools, staff assignments, per-number rules, and opt-in tracking.

CREATE TABLE IF NOT EXISTS twilio_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL,
    phone_number VARCHAR(20) NOT NULL,
    twilio_sid VARCHAR(64) NULL,
    friendly_name VARCHAR(120) NULL,
    status ENUM('active','pending','released') DEFAULT 'active',
    capabilities JSON NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_twilio_numbers_phone (phone_number),
    INDEX idx_twilio_numbers_agency (agency_id),
    INDEX idx_twilio_numbers_status (status),
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS twilio_number_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number_id INT NOT NULL,
    user_id INT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_number_user (number_id, user_id),
    INDEX idx_number_active (number_id, is_active),
    INDEX idx_user_active (user_id, is_active),
    FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS twilio_number_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number_id INT NOT NULL,
    rule_type ENUM('after_hours','opt_in','opt_out','help','emergency_forward','auto_reply','forward_inbound') NOT NULL,
    schedule_json JSON NULL,
    auto_reply_text TEXT NULL,
    forward_to_user_id INT NULL,
    forward_to_phone VARCHAR(20) NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_number_rule (number_id, rule_type),
    FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE CASCADE,
    FOREIGN KEY (forward_to_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS twilio_opt_in_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NULL,
    number_id INT NOT NULL,
    client_id INT NOT NULL,
    status ENUM('opted_in','opted_out','pending') NOT NULL DEFAULT 'pending',
    source VARCHAR(40) NULL,
    last_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_opt_in_client_number (number_id, client_id),
    INDEX idx_opt_in_agency (agency_id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: create numbers and assignments from legacy users.system_phone_number
INSERT INTO twilio_numbers (agency_id, phone_number, status, is_active)
SELECT
    MIN(ua.agency_id) AS agency_id,
    u.system_phone_number AS phone_number,
    'active' AS status,
    TRUE AS is_active
FROM users u
JOIN user_agencies ua ON ua.user_id = u.id
WHERE u.system_phone_number IS NOT NULL
GROUP BY u.system_phone_number;

INSERT INTO twilio_number_assignments (number_id, user_id, is_primary, is_active)
SELECT tn.id, u.id, TRUE, TRUE
FROM users u
JOIN twilio_numbers tn ON tn.phone_number = u.system_phone_number
WHERE u.system_phone_number IS NOT NULL;
