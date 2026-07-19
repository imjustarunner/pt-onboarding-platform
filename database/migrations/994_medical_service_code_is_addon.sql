-- Migration 994: Mark medical service codes as primary vs add-on
-- Add-on codes (e.g. 99051, 90875) can be billed with a primary encounter code.

ALTER TABLE agency_medical_service_codes
  ADD COLUMN is_addon TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = add-on code (not a primary encounter code); e.g. 99051, 90875';

UPDATE agency_medical_service_codes
SET is_addon = 1
WHERE UPPER(service_code) IN (
  '99051',
  '90875',
  '90785',
  '90840',
  '99354',
  '99355',
  '90833',
  '90836',
  '90838'
);
