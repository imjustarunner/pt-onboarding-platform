-- Migration 1757: SchoolCareBridge QA company
-- A standalone company for the existing QA accounts. It does not copy agency 450 or Cedar Grove.
INSERT INTO agencies (name, slug, portal_url, organization_type, is_active, feature_flags)
SELECT 'SchoolCareBridge QA Company', 'scb-qa-company', 'scb-qa-company', 'agency', TRUE,
  JSON_OBJECT(
    'schoolCareBridgeOnly', TRUE,
    'schoolPortalsEnabled', TRUE,
    'portalVariant', 'healthcare_provider',
    'googleSsoEnabled', FALSE,
    'payrollEnabled', FALSE,
    'medicalBillingEnabled', FALSE,
    'onboardingTrainingEnabled', FALSE,
    'clinicalNoteGeneratorEnabled', FALSE
  )
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE slug = 'scb-qa-company' OR portal_url = 'scb-qa-company');

INSERT INTO schoolcarebridge_partners (agency_id, workspace_mode, public_listed)
SELECT a.id, 'standalone', FALSE
FROM agencies a
WHERE a.slug = 'scb-qa-company'
  AND a.organization_type = 'agency'
  AND NOT EXISTS (SELECT 1 FROM schoolcarebridge_partners p WHERE p.agency_id = a.id);

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, a.id, TRUE
FROM users u
JOIN agencies a ON a.slug = 'scb-qa-company' AND a.organization_type = 'agency'
WHERE u.id IN (1433, 1434, 1435)
  AND NOT EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = a.id);
