-- Migration 907: allow PUBLIC_BOOKING_INQUIRY on clients.source for practitioner public booking
ALTER TABLE clients
  MODIFY COLUMN source ENUM(
    'BULK_IMPORT',
    'SCHOOL_UPLOAD',
    'SCHOOL_UPLOAD_INTERNAL',
    'PUBLIC_INTAKE_LINK',
    'PUBLIC_BOOKING_INQUIRY',
    'DIGITAL_FORM',
    'ADMIN_CREATED'
  ) NOT NULL
  COMMENT 'How the client record was created';
