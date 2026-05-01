-- Migration 820: add seasonal continuation of services checklist response
ALTER TABLE clients
  ADD COLUMN continuation_services_json JSON NULL
  COMMENT 'Seasonal school continuation of services checklist response'
  AFTER first_service_at;
