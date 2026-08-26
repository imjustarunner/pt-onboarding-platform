-- Migration 1305: Consultation self-pay service type for learning orgs

ALTER TABLE learning_services
  MODIFY COLUMN service_type ENUM(
    'TUTORING',
    'HOMEWORK_HELP',
    'GROUP_TUTORING',
    'CONSULTATION',
    'OTHER'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TUTORING';

-- Seed a default Consultation service for learning agencies that do not have one yet.
INSERT INTO learning_services (agency_id, name, code, service_type, default_fee_cents, currency, is_active)
SELECT
  a.id,
  'Consultation',
  'CONSULTATION',
  'CONSULTATION',
  0,
  'USD',
  1
FROM agencies a
WHERE LOWER(COALESCE(a.organization_type, '')) = 'learning'
  AND NOT EXISTS (
    SELECT 1
    FROM learning_services ls
    WHERE ls.agency_id = a.id
      AND (
        UPPER(COALESCE(ls.code, '')) = 'CONSULTATION'
        OR ls.service_type = 'CONSULTATION'
      )
  );
