/*
Migration 844: Add service type and tutoring context fields to public_appointment_requests.

service_type distinguishes counseling vs tutoring bookings.
subject_area and client_grade_level carry tutoring-specific context from the booking wizard.
*/

ALTER TABLE public_appointment_requests
  ADD COLUMN service_type VARCHAR(32) NULL COMMENT 'counseling | tutoring | NULL for legacy records' AFTER program_type,
  ADD COLUMN subject_area VARCHAR(64) NULL COMMENT 'Tutoring: requested subject area' AFTER service_type,
  ADD COLUMN client_grade_level VARCHAR(32) NULL COMMENT 'Tutoring: student grade level' AFTER subject_area;

ALTER TABLE public_appointment_requests
  ADD KEY idx_public_appt_requests_service_type (service_type);
