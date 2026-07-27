-- Migration 1061: allow PUBLIC_OFFICE_INTAKE on clients.source for the minimal
-- public digital intake form (Client Exchange / office clients foundation).
ALTER TABLE clients
  MODIFY COLUMN source ENUM(
    'BULK_IMPORT',
    'SCHOOL_UPLOAD',
    'SCHOOL_UPLOAD_INTERNAL',
    'PUBLIC_INTAKE_LINK',
    'PUBLIC_BOOKING_INQUIRY',
    'DIGITAL_FORM',
    'ADMIN_CREATED',
    'PUBLIC_OFFICE_INTAKE'
  ) NOT NULL
  COMMENT 'How the client record was created';
