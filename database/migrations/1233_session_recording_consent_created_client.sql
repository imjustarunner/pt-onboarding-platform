-- Migration 1233: session recording consent can mark a newly created client
ALTER TABLE session_recording_consents
  MODIFY COLUMN matched_by ENUM('client_id', 'name_dob', 'manual', 'none', 'created') NOT NULL DEFAULT 'none';

ALTER TABLE clients
  MODIFY COLUMN source ENUM(
    'BULK_IMPORT',
    'SCHOOL_UPLOAD',
    'SCHOOL_UPLOAD_INTERNAL',
    'PUBLIC_INTAKE_LINK',
    'PUBLIC_BOOKING_INQUIRY',
    'DIGITAL_FORM',
    'ADMIN_CREATED',
    'PUBLIC_OFFICE_INTAKE',
    'BILLING_IMPORT',
    'ADAPTIVE_QUICK_PROSPECTIVE',
    'SESSION_RECORDING'
  ) NOT NULL
  COMMENT 'How the client record was created';
