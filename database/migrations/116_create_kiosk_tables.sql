-- Migration: Create kiosk check-in and survey tables
-- Description: Public kiosk (no PHI) with slot-based identity and standardized surveys (PHQ-9/GAD-7).

CREATE TABLE IF NOT EXISTS kiosk_checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    provider_id INT NOT NULL COMMENT 'User receiving the check-in (provider/clinician)',
    slot_signature VARCHAR(64) NOT NULL COMMENT 'Derived identity: e.g., WED-1700-0512 (no PHI)',
    checkin_date DATE NOT NULL,
    checkin_time TIME NOT NULL,
    pin_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of PIN to support longitudinal matching without storing PIN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_kiosk_checkins_location_date (location_id, checkin_date),
    INDEX idx_kiosk_checkins_provider_date (provider_id, checkin_date),
    INDEX idx_kiosk_checkins_slot (provider_id, slot_signature, checkin_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kiosk_surveys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    provider_id INT NOT NULL,
    survey_type ENUM('PHQ9','GAD7') NOT NULL,
    slot_signature VARCHAR(64) NOT NULL,
    survey_date DATE NOT NULL,
    pin_hash CHAR(64) NOT NULL,
    answers JSON NOT NULL,
    score INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_kiosk_surveys_provider_date (provider_id, survey_date),
    INDEX idx_kiosk_surveys_slot (provider_id, slot_signature, survey_type, survey_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

