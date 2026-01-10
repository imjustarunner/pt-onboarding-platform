-- Migration: Add user-agency and user-program relationships
-- Description: Many-to-many relationships for multi-agency support

CREATE TABLE IF NOT EXISTS user_agencies (
    user_id INT NOT NULL,
    agency_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_agency (agency_id)
);

CREATE TABLE IF NOT EXISTS user_programs (
    user_id INT NOT NULL,
    program_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, program_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_program (program_id)
);

