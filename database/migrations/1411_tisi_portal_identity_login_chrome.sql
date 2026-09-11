-- Migration 1411: Inner Strength Institute portal identity + login chrome
-- Ensures official_name, dedicated custom domain, and a dark-blue login background
-- so disclosures / portal login / branded /login use TISI (not ITSCO defaults).

UPDATE agencies
SET
  official_name = COALESCE(NULLIF(TRIM(official_name), ''), 'The Inner Strength Institute'),
  custom_domain = COALESCE(NULLIF(TRIM(custom_domain), ''), 'app.theinnerstrengthinstitute.com'),
  theme_settings = JSON_SET(
    COALESCE(theme_settings, CAST('{}' AS JSON)),
    '$.loginBackground',
    COALESCE(
      NULLIF(JSON_UNQUOTE(JSON_EXTRACT(theme_settings, '$.loginBackground')), ''),
      'radial-gradient(ellipse at 50% 20%, #236592 0%, #174B73 42%, #13304E 100%)'
    )
  )
WHERE id = 377
   OR LOWER(COALESCE(slug, '')) = 'tisi'
   OR LOWER(COALESCE(portal_url, '')) = 'tisi';

-- Keep TISI staff (admins / super_admins / providers) OPEN globally so intake
-- lists them as Accepting, not Waitlist, even before agency-scoped open slots exist.
UPDATE users u
INNER JOIN user_agencies ua ON ua.user_id = u.id
SET u.provider_accepting_new_clients = 1
WHERE ua.agency_id = 377
  AND COALESCE(ua.is_active, 1) = 1
  AND LOWER(COALESCE(u.role, '')) IN (
    'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor',
    'clinical_practice_assistant', 'counselor', 'therapist', 'coach',
    'employee', 'admin', 'super_admin'
  );
