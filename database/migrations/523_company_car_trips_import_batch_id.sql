-- Migration: Add import_batch_id to company_car_trips for "Remove last import"

ALTER TABLE company_car_trips
  ADD COLUMN import_batch_id VARCHAR(36) NULL AFTER notes,
  ADD INDEX idx_company_car_trips_import_batch (import_batch_id);
