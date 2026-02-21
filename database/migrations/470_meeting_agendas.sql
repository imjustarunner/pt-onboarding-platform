-- Create meeting_agendas. One agenda per meeting; polymorphic via meeting_type + meeting_id.

CREATE TABLE IF NOT EXISTS meeting_agendas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  meeting_type VARCHAR(32) NOT NULL,
  meeting_id INT NOT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_meeting_agendas_meeting (meeting_type, meeting_id),
  INDEX idx_meeting_agendas_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
