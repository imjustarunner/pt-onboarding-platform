-- Migration: add location to payroll_import_rows for session fingerprinting
-- Purpose: same session (client, date, service, clinician, location) persists across duration/status changes.

ALTER TABLE payroll_import_rows
  ADD COLUMN location VARCHAR(128) NULL AFTER service_code;
