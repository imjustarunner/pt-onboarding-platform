-- Migration 1138: multi-photo gallery for office rooms
CREATE TABLE IF NOT EXISTS office_room_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  caption VARCHAR(512) NULL DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_room_photos_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_room_photos_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_office_room_photos_room_active (room_id, is_active, sort_order),
  INDEX idx_office_room_photos_primary (room_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed primary gallery rows from legacy single photo_url when present.
INSERT INTO office_room_photos (room_id, file_path, sort_order, is_primary, is_active)
SELECT r.id, r.photo_url, 0, 1, 1
FROM office_rooms r
WHERE r.photo_url IS NOT NULL
  AND TRIM(r.photo_url) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM office_room_photos p WHERE p.room_id = r.id AND p.is_active = 1
  );
