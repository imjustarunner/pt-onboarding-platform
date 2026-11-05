-- Service-facility name paired with the existing CCHA billing-NPI rule.
-- Existing saved billing practice names are the only seed source. Do not invent
-- names from office nicknames, school names, patient addresses or tenant labels.
SET @facility_column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'office_locations'
    AND column_name = 'claim_facility_name'
);
SET @facility_column_sql = IF(@facility_column_exists = 0,
  'ALTER TABLE office_locations ADD COLUMN claim_facility_name VARCHAR(35) NULL AFTER practice_name',
  'SELECT 1');
PREPARE facility_column_stmt FROM @facility_column_sql;
EXECUTE facility_column_stmt;
DEALLOCATE PREPARE facility_column_stmt;

UPDATE office_locations
SET claim_facility_name = TRIM(practice_name)
WHERE is_active = 1 AND use_as_billing_address = 1
  AND NULLIF(TRIM(claim_facility_name), '') IS NULL
  AND CHAR_LENGTH(TRIM(practice_name)) BETWEEN 1 AND 35;
