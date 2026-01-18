-- Migration: Add address fields needed for automatic mileage calculation
-- Description: Store provider home address, school address, and office location address to compute mileage automatically.

ALTER TABLE users
  ADD COLUMN home_street_address VARCHAR(255) NULL AFTER last_name,
  ADD COLUMN home_city VARCHAR(128) NULL AFTER home_street_address,
  ADD COLUMN home_state VARCHAR(64) NULL AFTER home_city,
  ADD COLUMN home_postal_code VARCHAR(32) NULL AFTER home_state;

ALTER TABLE agencies
  ADD COLUMN street_address VARCHAR(255) NULL AFTER name,
  ADD COLUMN city VARCHAR(128) NULL AFTER street_address,
  ADD COLUMN state VARCHAR(64) NULL AFTER city,
  ADD COLUMN postal_code VARCHAR(32) NULL AFTER state;

ALTER TABLE office_locations
  ADD COLUMN street_address VARCHAR(255) NULL AFTER name,
  ADD COLUMN city VARCHAR(128) NULL AFTER street_address,
  ADD COLUMN state VARCHAR(64) NULL AFTER city,
  ADD COLUMN postal_code VARCHAR(32) NULL AFTER state;

