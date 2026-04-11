-- Add INACTIVE_EMPLOYEE: former staff/providers removed from org/school affiliations but record kept for history.

ALTER TABLE users
MODIFY COLUMN status ENUM(
  'PROSPECTIVE',
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'INACTIVE_EMPLOYEE',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP';
