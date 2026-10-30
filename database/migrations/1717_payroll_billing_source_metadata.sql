-- Keep only logical source ordinals and POS in payroll. Full source identity and
-- insurance observations live in the encrypted profile-observation table.
ALTER TABLE payroll_import_rows
 ADD COLUMN source_row_number INT NULL,
 ADD COLUMN place_of_service VARCHAR(16) NULL,
 ADD UNIQUE KEY uq_payroll_import_source_row (payroll_import_id,source_row_number);
ALTER TABLE payroll_imports ADD COLUMN client_profile_summary_json JSON NULL;
