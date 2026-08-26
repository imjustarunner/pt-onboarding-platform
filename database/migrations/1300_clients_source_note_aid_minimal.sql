-- Migration 1300: allow NOTE_AID_MINIMAL on clients.source for Note Aid create-client
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
    'SESSION_RECORDING',
    'NOTE_AID_MINIMAL'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
  COMMENT 'How the client record was created';
