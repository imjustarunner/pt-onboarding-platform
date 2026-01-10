-- Migration: Create branding templates system
-- Description: Add tables for branding templates and scheduling to allow users to save, share, and schedule branding themes

-- Create branding_templates table
CREATE TABLE IF NOT EXISTS branding_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  scope ENUM('platform', 'agency') NOT NULL,
  agency_id INT NULL,
  created_by_user_id INT NOT NULL,
  is_shared BOOLEAN DEFAULT FALSE COMMENT 'Platform templates that can be used by agencies',
  template_data JSON NOT NULL COMMENT 'Selective branding data (colors, fonts, icons, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scope_agency (scope, agency_id),
  INDEX idx_shared (is_shared)
);

-- Create branding_template_schedules table
CREATE TABLE IF NOT EXISTS branding_template_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  scope ENUM('platform', 'agency') NOT NULL,
  agency_id INT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES branding_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scope_agency (scope, agency_id),
  INDEX idx_dates (start_date, end_date, is_active)
);
