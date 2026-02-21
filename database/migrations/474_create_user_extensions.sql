-- Migration: Create user_extensions table for voice extension dialing
-- Description: Allows staff to have extensions (e.g., 101, 102) that callers can dial after calling the main number.
-- Extensions are unique per agency. number_id NULL = extension applies when calling any agency number.

CREATE TABLE IF NOT EXISTS user_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  extension VARCHAR(20) NOT NULL,
  number_id INT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_extension (agency_id, extension),
  INDEX idx_agency (agency_id),
  INDEX idx_number (number_id),
  INDEX idx_user (user_id),
  INDEX idx_agency_extension_active (agency_id, extension, is_active),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
