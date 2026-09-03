-- Migration 1362: school group email subscription (Each email / Digest / Abridged / No email)

ALTER TABLE school_contacts
  MODIFY COLUMN email_delivery_preference ENUM(
    'email',
    'no_email',
    'all_mail',
    'digest',
    'daily',
    'none'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NOT NULL DEFAULT 'all_mail'
  COMMENT 'Google Group delivery: all_mail, digest, daily (abridged), none';

UPDATE school_contacts
SET email_delivery_preference = 'all_mail'
WHERE email_delivery_preference = 'email';

UPDATE school_contacts
SET email_delivery_preference = 'none'
WHERE email_delivery_preference = 'no_email';

ALTER TABLE school_contacts
  MODIFY COLUMN email_delivery_preference ENUM(
    'all_mail',
    'digest',
    'daily',
    'none'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NOT NULL DEFAULT 'all_mail'
  COMMENT 'Google Group delivery: all_mail, digest, daily (abridged), none';
