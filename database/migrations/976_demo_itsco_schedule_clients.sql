-- Migration 976: Demo ITSCO schedule booking clients
-- Ensures the training tenant has clearly named clients for individual session booking demos.

INSERT INTO clients (
  organization_id,
  agency_id,
  provider_id,
  full_name,
  initials,
  identifier_code,
  status,
  submission_date,
  document_status,
  source,
  client_type,
  created_by_user_id
)
SELECT
  382,
  381,
  721,
  seed.full_name,
  seed.initials,
  seed.identifier_code,
  'ACTIVE',
  CURDATE(),
  'NONE',
  'ADMIN_CREATED',
  'clinical',
  1
FROM (
  SELECT 'Schedule Demo Client One' AS full_name, 'SD1' AS initials, 'SCHED-DEMO-01' AS identifier_code
  UNION ALL SELECT 'Schedule Demo Client Two', 'SD2', 'SCHED-DEMO-02'
  UNION ALL SELECT 'Schedule Demo Client Three', 'SD3', 'SCHED-DEMO-03'
  UNION ALL SELECT 'Schedule Demo Client Four', 'SD4', 'SCHED-DEMO-04'
  UNION ALL SELECT 'Schedule Demo Client Five', 'SD5', 'SCHED-DEMO-05'
) seed
WHERE NOT EXISTS (
  SELECT 1
  FROM clients c
  WHERE c.agency_id = 381
    AND c.identifier_code = seed.identifier_code
);
