-- Clinical linkage for telehealth, school, and other sessions without an office event.
-- The appointment lives in the main database; no cross-database foreign key.
ALTER TABLE clinical_sessions
  ADD COLUMN appointment_id INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_clinical_appointment_client (appointment_id, client_id, agency_id);
