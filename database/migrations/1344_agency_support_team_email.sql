-- Migration 1344: Tenant client-facing support team email
-- Used on public join/intake pages instead of inventing support@{slug}.health

ALTER TABLE agencies
  ADD COLUMN support_team_email VARCHAR(255)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Client-facing support inbox (shown on join/intake pages)'
    AFTER onboarding_team_email;

-- Known tenant values
UPDATE agencies
SET support_team_email = 'support@nextleveluplcc.com'
WHERE slug = 'nlu'
  AND (support_team_email IS NULL OR support_team_email = '');

UPDATE agencies
SET support_team_email = 'support@itsco.health'
WHERE slug = 'itsco'
  AND (support_team_email IS NULL OR support_team_email = '');
