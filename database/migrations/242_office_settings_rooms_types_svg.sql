-- Migration: Office settings (SVG URL, room types, room number/label)
-- Purpose:
-- - Store Office SVG map as a link (svg_url) while keeping svg_markup optional
-- - Add room types per office + room<->type links
-- - Add room_number + label fields to rooms (while preserving legacy name)

ALTER TABLE office_locations
  ADD COLUMN svg_url VARCHAR(1024) NULL AFTER access_key;

CREATE TABLE IF NOT EXISTS office_room_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_room_types_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  INDEX idx_office_room_types_office (office_location_id, is_active, sort_order),
  UNIQUE KEY uniq_office_room_type_name (office_location_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE office_rooms
  ADD COLUMN room_number INT NULL AFTER location_id,
  ADD COLUMN label VARCHAR(255) NULL AFTER room_number;

CREATE TABLE IF NOT EXISTS office_room_type_links (
  room_id INT NOT NULL,
  room_type_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, room_type_id),
  CONSTRAINT fk_office_room_type_links_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_room_type_links_type
    FOREIGN KEY (room_type_id) REFERENCES office_room_types(id) ON DELETE CASCADE,
  INDEX idx_office_room_type_links_type (room_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

