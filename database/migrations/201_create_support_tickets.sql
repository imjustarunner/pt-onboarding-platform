-- Migration: Create support tickets (School Staff Q&A)
-- Description: School staff can submit questions; agency admin/support can answer.

CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  agency_id INT NULL,
  subject VARCHAR(255) NULL,
  question TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  answer TEXT NULL,
  answered_by_user_id INT NULL,
  answered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (answered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ticket_school (school_organization_id),
  INDEX idx_ticket_created_by (created_by_user_id),
  INDEX idx_ticket_status (status),
  INDEX idx_ticket_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

