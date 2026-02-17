ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin',
    'supervisor',
    'facilitator',
    'intern',
    'super_admin',
    'support',
    'staff',
    'provider',
    'school_staff',
    'client_guardian',
    'clinical_practice_assistant',
    'provider_plus',
    'kiosk'
  )
  NULL
  DEFAULT 'provider';
