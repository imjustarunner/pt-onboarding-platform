-- Migration: Create office scheduling tables
-- Description: Office Scheduling module ("Space Manager") core tables: locations, rooms, requests, assignments.

CREATE TABLE IF NOT EXISTS office_locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(64) DEFAULT 'America/New_York',
    access_key VARCHAR(64) NOT NULL,
    svg_markup LONGTEXT NULL COMMENT 'SVG markup used for interactive room map (elements referenced by rooms.svg_room_id)',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_location_access_key (access_key),
    INDEX idx_location_agency (agency_id),
    INDEX idx_location_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    svg_room_id VARCHAR(128) NULL COMMENT 'SVG element id used to attach click + color styling',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
    INDEX idx_room_location (location_id),
    INDEX idx_room_active (is_active),
    INDEX idx_room_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_room_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    location_id INT NOT NULL,
    room_id INT NOT NULL,
    request_type ENUM('ONE_TIME','RECURRING','PERMANENT') DEFAULT 'ONE_TIME',
    status ENUM('PENDING','APPROVED','DENIED','CANCELLED') DEFAULT 'PENDING',
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    notes TEXT NULL,
    decided_by_user_id INT NULL,
    decided_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_request_location (location_id),
    INDEX idx_request_room (room_id),
    INDEX idx_request_user (user_id),
    INDEX idx_request_status (status),
    INDEX idx_request_time (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_room_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    assigned_user_id INT NOT NULL,
    assignment_type ENUM('ONE_TIME','RECURRING','PERMANENT') DEFAULT 'ONE_TIME',
    start_at DATETIME NOT NULL,
    end_at DATETIME NULL COMMENT 'NULL allowed for PERMANENT assignments',
    source_request_id INT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_request_id) REFERENCES office_room_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_assignment_room (room_id),
    INDEX idx_assignment_user (assigned_user_id),
    INDEX idx_assignment_type (assignment_type),
    INDEX idx_assignment_time (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

