-- Migration: Create company_cars table for agency vehicles

CREATE TABLE IF NOT EXISTS company_cars (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_company_cars_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  INDEX idx_company_cars_agency (agency_id),
  INDEX idx_company_cars_agency_active (agency_id, is_active)
);
