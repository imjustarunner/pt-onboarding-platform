ALTER TABLE appointments
  ADD COLUMN product_origin VARCHAR(32) NOT NULL DEFAULT 'full_suite',
  ADD COLUMN location_label VARCHAR(255) NULL;
ALTER TABLE auricwell_records
  ADD COLUMN canonical_appointment_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_aw_record_appointment FOREIGN KEY (canonical_appointment_id) REFERENCES appointments(id),
  ADD UNIQUE KEY aw_record_appointment (practice_id, canonical_appointment_id);
