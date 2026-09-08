-- Migration 1398: Persist schedule add-on codes (99051) + provider claim billing mode
-- Add-ons on appointments / office booking plans / office events so recurring series
-- keep codes like 99051 for ClaimMD claim lines. Provider default: bill under self vs billing supervisor.

ALTER TABLE appointments
  ADD COLUMN service_code VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Primary CPT/HCPCS for this appointment'
    AFTER tenant_service_id,
  ADD COLUMN addon_service_codes_json JSON NULL
    COMMENT 'JSON array of add-on CPT/HCPCS (e.g. ["99051"])'
    AFTER service_code;

ALTER TABLE office_booking_plans
  ADD COLUMN service_code VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Primary CPT/HCPCS for the series'
    AFTER booked_occurrence_count,
  ADD COLUMN addon_service_codes_json JSON NULL
    COMMENT 'JSON array of series add-on codes (e.g. ["99051"])'
    AFTER service_code;

ALTER TABLE office_events
  ADD COLUMN addon_service_codes_json JSON NULL
    COMMENT 'JSON array of add-on CPT/HCPCS for this occurrence'
    AFTER service_code;

ALTER TABLE user_agencies
  ADD COLUMN claim_billing_mode VARCHAR(32) NULL DEFAULT 'self'
    COMMENT 'self|billing_supervisor — default claim NPI scenario for all payers'
    AFTER has_billing_access;
