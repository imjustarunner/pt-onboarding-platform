-- Psychotherapy Compliance: store initials + DOB hash for best-effort matching
-- Notes:
-- - DOB is stored only as a keyed hash (no plaintext DOB).
-- - Initials are stored normalized (no PHI).

ALTER TABLE agency_psychotherapy_report_rows
  ADD COLUMN patient_initials_normalized VARCHAR(32) NULL AFTER provider_name_normalized,
  ADD COLUMN dob_hash CHAR(64) NULL AFTER patient_initials_normalized;

CREATE INDEX idx_apsr_agency_initials_fy ON agency_psychotherapy_report_rows(agency_id, patient_initials_normalized, fiscal_year_start);
CREATE INDEX idx_apsr_agency_initials_dobhash ON agency_psychotherapy_report_rows(agency_id, patient_initials_normalized, dob_hash);

