-- Add packet status and internal upload source for referral uploads
ALTER TABLE clients
  MODIFY COLUMN document_status ENUM('NONE', 'UPLOADED', 'PACKET', 'APPROVED', 'REJECTED') DEFAULT 'NONE' NOT NULL;

ALTER TABLE clients
  MODIFY COLUMN source ENUM(
    'BULK_IMPORT',
    'SCHOOL_UPLOAD',
    'SCHOOL_UPLOAD_INTERNAL',
    'PUBLIC_INTAKE_LINK',
    'DIGITAL_FORM',
    'ADMIN_CREATED'
  ) NOT NULL;
