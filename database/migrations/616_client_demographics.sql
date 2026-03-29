-- Demographics fields on the clients table.
-- Populated from the demographics intake step (and legacy field backfill).
-- Written without IF NOT EXISTS for MySQL 5.7 compatibility;
-- the migration runner skips Duplicate column name errors automatically.
ALTER TABLE clients ADD COLUMN address_street     VARCHAR(255) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN address_apt        VARCHAR(64)  DEFAULT NULL;
ALTER TABLE clients ADD COLUMN address_city       VARCHAR(100) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN address_state      VARCHAR(50)  DEFAULT NULL;
ALTER TABLE clients ADD COLUMN address_zip        VARCHAR(20)  DEFAULT NULL;
ALTER TABLE clients ADD COLUMN ethnicity          VARCHAR(100) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN preferred_language VARCHAR(100) DEFAULT NULL;
-- Stores the primary insurer carrier name from the most recent intake.
-- Separate from insurance_type_id (which is an admin-facing category FK).
ALTER TABLE clients ADD COLUMN primary_insurer_name VARCHAR(255) DEFAULT NULL;
