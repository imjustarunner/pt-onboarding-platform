-- Migration 1092: allow BILLING_IMPORT on clients.source for canonical billing report ingest
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
    'BILLING_IMPORT'
  ) NOT NULL
  COMMENT 'How the client record was created';
