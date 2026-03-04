-- Migration: Add default mileage reason to agencies (schools) and company_car_usual_places
-- Enables auto-filling "reason for travel" when a destination is selected

ALTER TABLE agencies
  ADD COLUMN company_car_default_reason VARCHAR(255) NULL;

ALTER TABLE company_car_usual_places
  ADD COLUMN default_reason VARCHAR(255) NULL;
