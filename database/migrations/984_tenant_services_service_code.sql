-- Migration 984: CPT/HCPCS (or other) service code on unified booking tenant services
ALTER TABLE tenant_services
  ADD COLUMN service_code VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'Billing / catalog code (e.g. 90837, H2014) when applicable'
  AFTER description;

ALTER TABLE tenant_services
  ADD KEY idx_tenant_services_service_code (agency_id, service_code);
