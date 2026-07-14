-- Migration 904: seed DEMO Consulting + DEMO Life Coach practitioner tenants
-- Platform testing lab targets; excluded from organization billing/usage lists by demo naming.

-- DEMO Consulting (solo consultant vertical)
INSERT INTO agencies (
  name,
  official_name,
  slug,
  portal_url,
  organization_type,
  is_active,
  feature_flags,
  color_palette,
  public_availability_enabled
)
SELECT
  'DEMO Consulting',
  'DEMO Consulting',
  'demo-consulting',
  'demo-consulting',
  'consultant',
  TRUE,
  JSON_OBJECT(
    'practitionerVertical', 'consultant',
    'portalVariant', 'employee',
    'publicAvailabilityEnabled', true
  ),
  JSON_OBJECT(
    'primary', '#7c3aed',
    'secondary', '#0f172a',
    'accent', '#4f46e5'
  ),
  TRUE
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM agencies WHERE slug = 'demo-consulting' OR portal_url = 'demo-consulting'
);

-- DEMO Life Coach (solo life coach vertical)
INSERT INTO agencies (
  name,
  official_name,
  slug,
  portal_url,
  organization_type,
  is_active,
  feature_flags,
  color_palette,
  public_availability_enabled
)
SELECT
  'DEMO Life Coach',
  'DEMO Life Coach Journey',
  'demo-life-coach',
  'demo-life-coach',
  'life_coach',
  TRUE,
  JSON_OBJECT(
    'practitionerVertical', 'life_coach',
    'portalVariant', 'employee',
    'publicAvailabilityEnabled', true
  ),
  JSON_OBJECT(
    'primary', '#1a3a2a',
    'secondary', '#c4a574',
    'accent', '#2d6a4f'
  ),
  TRUE
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM agencies WHERE slug = 'demo-life-coach' OR portal_url = 'demo-life-coach'
);

-- Client pipeline statuses for these demo tenants (incl. prospective)
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, v.status_key, v.label, v.description, TRUE
FROM agencies a
JOIN (
  SELECT 'prospective' AS status_key, 'Prospective' AS label, 'Inquiry received; awaiting discovery / onboarding.' AS description
  UNION ALL SELECT 'screener', 'Screener', 'Discovery scheduled or completed.'
  UNION ALL SELECT 'packet', 'Packet', 'Client onboarding package sent / in progress.'
  UNION ALL SELECT 'current', 'Current', 'Actively engaged client.'
  UNION ALL SELECT 'pending', 'Pending', 'Pending assignment and/or paperwork.'
  UNION ALL SELECT 'inactive', 'Inactive', 'Not active currently; may resume later.'
) v
WHERE a.slug IN ('demo-consulting', 'demo-life-coach')
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  is_active = TRUE;
