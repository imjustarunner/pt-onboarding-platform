-- One payroll benefit request per signed appointment cancellation/no-show.
-- A request reserves availability; the existing atomic payroll approval deducts
-- earned hours only after the payment is successfully applied.
ALTER TABLE payroll_pto_requests
  ADD COLUMN source_appointment_id INT NULL,
  ADD UNIQUE KEY uq_pto_request_source_appointment (source_appointment_id);
