-- Migration: Add photo_path to company_cars for vehicle identification

ALTER TABLE company_cars
  ADD COLUMN photo_path VARCHAR(512) NULL DEFAULT NULL AFTER name;
