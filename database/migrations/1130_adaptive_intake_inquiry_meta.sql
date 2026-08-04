-- Migration 1130: Adaptive intake inquiry metadata + source enum
-- Extends office-intake / prospective clients with pathway + conversion tracking
-- without inventing a parallel clinical record store.

ALTER TABLE clients
  ADD COLUMN adaptive_intake_meta_json JSON NULL
  COMMENT 'Adaptive intake pathway meta: pathway, respondent, conversion, preferred provider';

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
    'ADAPTIVE_QUICK_PROSPECTIVE'
  ) NOT NULL
  COMMENT 'How the client record was created';
