-- Migration: Create company_car_usual_places table for learned destinations

CREATE TABLE IF NOT EXISTS company_car_usual_places (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(512) NULL,
  use_count INT NOT NULL DEFAULT 0,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_company_car_usual_places_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  UNIQUE KEY uniq_company_car_usual_places_agency_name (agency_id, name),
  INDEX idx_company_car_usual_places_agency (agency_id),
  INDEX idx_company_car_usual_places_use_count (agency_id, use_count DESC)
);
