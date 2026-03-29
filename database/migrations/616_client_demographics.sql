-- Demographics fields on the clients table.
-- These are populated from the demographics intake step.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS address_street  VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address_apt     VARCHAR(64)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address_city    VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address_state   VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address_zip     VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ethnicity       VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(100) DEFAULT NULL;
