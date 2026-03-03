-- Migration: Create company_car_trips table for trip records

CREATE TABLE IF NOT EXISTS company_car_trips (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  company_car_id INT NOT NULL,
  user_id INT NOT NULL,
  drive_date DATE NOT NULL,
  start_odometer_miles DECIMAL(10,2) NOT NULL,
  end_odometer_miles DECIMAL(10,2) NOT NULL,
  miles DECIMAL(10,2) NOT NULL,
  destinations_json JSON NULL,
  reason_for_travel VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_company_car_trips_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_car_trips_company_car_id FOREIGN KEY (company_car_id) REFERENCES company_cars (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_car_trips_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_company_car_trips_miles CHECK (miles >= 0),
  INDEX idx_company_car_trips_agency (agency_id),
  INDEX idx_company_car_trips_car (company_car_id),
  INDEX idx_company_car_trips_user (user_id),
  INDEX idx_company_car_trips_drive_date (drive_date)
);
