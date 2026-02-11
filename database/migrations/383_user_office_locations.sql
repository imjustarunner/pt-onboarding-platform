-- Canonical user-to-building linkage for office scheduling visibility.
-- Phase 2 foundation: explicit links can coexist with agency-based linkage.
CREATE TABLE IF NOT EXISTS user_office_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  office_location_id INT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  linked_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_office_locations_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_office_locations_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_office_locations_linked_by
    FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_user_office_location_active (user_id, office_location_id),
  INDEX idx_user_office_locations_office_active (office_location_id, is_active),
  INDEX idx_user_office_locations_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

