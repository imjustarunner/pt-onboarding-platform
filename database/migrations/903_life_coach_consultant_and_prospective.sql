-- Migration 903: life_coach / consultant org types + prospective client status
-- Description:
-- - Extends agencies.organization_type with life_coach and consultant (solo SaaS root tenants).
-- - Seeds client_statuses.status_key = 'prospective' for all agencies (platform-wide pipeline foundation).

ALTER TABLE agencies
  MODIFY COLUMN organization_type ENUM(
    'agency',
    'school',
    'program',
    'learning',
    'clinical',
    'affiliation',
    'ClubWebApp',
    'life_coach',
    'consultant'
  ) NOT NULL DEFAULT 'agency';

-- Prospective client status for every agency (unique on agency_id + status_key)
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT
  a.id,
  'prospective',
  'Prospective',
  'Inquiry received; awaiting discovery session and/or client onboarding.',
  TRUE
FROM agencies a
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  is_active = TRUE;
