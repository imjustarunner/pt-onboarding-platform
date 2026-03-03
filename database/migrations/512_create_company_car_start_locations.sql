-- Migration: Company car start locations (office + owner homes, max 4 per agency)

CREATE TABLE IF NOT EXISTS company_car_start_locations (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address_line VARCHAR(512) NOT NULL,
  display_order TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_company_car_start_locations_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  INDEX idx_company_car_start_locations_agency (agency_id)
);
