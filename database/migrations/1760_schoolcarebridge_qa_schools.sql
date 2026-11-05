-- Migration 1760: SchoolCareBridge QA schools and staff
-- Three schools under scb-qa-company. Group mailboxes use @example.com so
-- school notices arrive at testing@itsco.health. Staff accounts have no password.

INSERT INTO agencies (name, official_name, slug, portal_url, organization_type, is_active, is_archived, feature_flags)
SELECT v.name, v.name, v.slug, v.slug, 'school', 1, 0,
  CAST('{"schoolPortalsEnabled":true}' AS JSON)
FROM (
  SELECT 'Northridge Elementary' AS name, 'scb-qa-northridge' AS slug
  UNION ALL SELECT 'Westbrook Middle', 'scb-qa-westbrook'
  UNION ALL SELECT 'Harbor High', 'scb-qa-harbor'
) v
WHERE EXISTS (
  SELECT 1 FROM agencies company
  WHERE company.slug = 'scb-qa-company' AND company.organization_type = 'agency'
)
AND NOT EXISTS (SELECT 1 FROM agencies existing WHERE existing.slug = v.slug);

INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
SELECT company.id, school.id, 1
FROM agencies company
JOIN agencies school ON school.slug IN ('scb-qa-northridge', 'scb-qa-westbrook', 'scb-qa-harbor')
  AND school.organization_type = 'school'
WHERE company.slug = 'scb-qa-company' AND company.organization_type = 'agency'
  AND NOT EXISTS (
    SELECT 1 FROM organization_affiliations oa
    WHERE oa.agency_id = company.id AND oa.organization_id = school.id
  );

INSERT INTO agency_schools (agency_id, school_organization_id, is_active)
SELECT company.id, school.id, 1
FROM agencies company
JOIN agencies school ON school.slug IN ('scb-qa-northridge', 'scb-qa-westbrook', 'scb-qa-harbor')
  AND school.organization_type = 'school'
WHERE company.slug = 'scb-qa-company' AND company.organization_type = 'agency'
  AND NOT EXISTS (
    SELECT 1 FROM agency_schools link
    WHERE link.agency_id = company.id AND link.school_organization_id = school.id
  );

INSERT INTO school_profiles (school_organization_id, district_name, itsco_email, primary_contact_name, primary_contact_email, primary_contact_role)
SELECT school.id, 'SchoolCareBridge QA', v.group_email, v.contact_name, v.contact_email, v.contact_role
FROM (
  SELECT 'scb-qa-northridge' AS slug, 'qa.school.northridge@example.com' AS group_email,
    'Riley North' AS contact_name, 'qa.staff.northridge.admin@example.com' AS contact_email, 'School Admin' AS contact_role
  UNION ALL SELECT 'scb-qa-westbrook', 'qa.school.westbrook@example.com', 'Morgan West', 'qa.staff.westbrook.scheduler@example.com', 'Scheduler'
  UNION ALL SELECT 'scb-qa-harbor', 'qa.school.harbor@example.com', 'Harper Harbor', 'qa.staff.harbor.standard@example.com', 'School Staff'
) v
JOIN agencies school ON school.slug = v.slug AND school.organization_type = 'school'
WHERE NOT EXISTS (
  SELECT 1 FROM school_profiles profile WHERE profile.school_organization_id = school.id
);

UPDATE school_profiles profile
JOIN agencies school ON school.id = profile.school_organization_id
JOIN (
  SELECT 'scb-qa-northridge' AS slug, 'qa.school.northridge@example.com' AS group_email
  UNION ALL SELECT 'scb-qa-westbrook', 'qa.school.westbrook@example.com'
  UNION ALL SELECT 'scb-qa-harbor', 'qa.school.harbor@example.com'
) v ON v.slug = school.slug
SET profile.itsco_email = v.group_email,
    profile.district_name = 'SchoolCareBridge QA';

INSERT INTO users (
  email, username, personal_email, work_email,
  first_name, last_name, role, title, status,
  is_active, is_archived, is_hourly_worker, has_supervisor_privileges,
  sso_password_override, is_demo
)
SELECT v.email, v.email, v.email, v.email,
  v.first_name, v.last_name, 'school_staff', v.title, 'ACTIVE_EMPLOYEE',
  1, 0, 0, 0, 1, 1
FROM (
  SELECT 'qa.staff.northridge.admin@example.com' AS email, 'Riley' AS first_name, 'North' AS last_name, 'School Admin' AS title
  UNION ALL SELECT 'qa.staff.northridge.standard@example.com', 'Sam', 'North', 'School Staff'
  UNION ALL SELECT 'qa.staff.westbrook.scheduler@example.com', 'Morgan', 'West', 'Scheduler'
  UNION ALL SELECT 'qa.staff.westbrook.admin-scheduler@example.com', 'Pat', 'West', 'School Admin and Scheduler'
  UNION ALL SELECT 'qa.staff.harbor.standard@example.com', 'Harper', 'Harbor', 'School Staff'
  UNION ALL SELECT 'qa.staff.harbor.admin@example.com', 'Drew', 'Harbor', 'School Admin'
) v
WHERE NOT EXISTS (SELECT 1 FROM users existing WHERE existing.email = v.email);

UPDATE users u
JOIN (
  SELECT 'qa.staff.northridge.admin@example.com' AS email, 'Riley' AS first_name, 'North' AS last_name, 'School Admin' AS title
  UNION ALL SELECT 'qa.staff.northridge.standard@example.com', 'Sam', 'North', 'School Staff'
  UNION ALL SELECT 'qa.staff.westbrook.scheduler@example.com', 'Morgan', 'West', 'Scheduler'
  UNION ALL SELECT 'qa.staff.westbrook.admin-scheduler@example.com', 'Pat', 'West', 'School Admin and Scheduler'
  UNION ALL SELECT 'qa.staff.harbor.standard@example.com', 'Harper', 'Harbor', 'School Staff'
  UNION ALL SELECT 'qa.staff.harbor.admin@example.com', 'Drew', 'Harbor', 'School Admin'
) v ON v.email = u.email
SET u.role = 'school_staff',
    u.title = v.title,
    u.first_name = v.first_name,
    u.last_name = v.last_name,
    u.status = 'ACTIVE_EMPLOYEE',
    u.is_active = 1,
    u.is_archived = 0,
    u.is_demo = 1,
    u.sso_password_override = 1;

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, school.id, 1
FROM users u
JOIN (
  SELECT 'qa.staff.northridge.admin@example.com' AS email, 'scb-qa-northridge' AS slug
  UNION ALL SELECT 'qa.staff.northridge.standard@example.com', 'scb-qa-northridge'
  UNION ALL SELECT 'qa.staff.westbrook.scheduler@example.com', 'scb-qa-westbrook'
  UNION ALL SELECT 'qa.staff.westbrook.admin-scheduler@example.com', 'scb-qa-westbrook'
  UNION ALL SELECT 'qa.staff.harbor.standard@example.com', 'scb-qa-harbor'
  UNION ALL SELECT 'qa.staff.harbor.admin@example.com', 'scb-qa-harbor'
) v ON v.email = u.email
JOIN agencies school ON school.slug = v.slug AND school.organization_type = 'school'
WHERE NOT EXISTS (
  SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = school.id
);

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, company.id, 1
FROM users u
JOIN agencies company ON company.slug = 'scb-qa-company' AND company.organization_type = 'agency'
WHERE u.email IN (
  'qa.staff.northridge.admin@example.com', 'qa.staff.northridge.standard@example.com',
  'qa.staff.westbrook.scheduler@example.com', 'qa.staff.westbrook.admin-scheduler@example.com',
  'qa.staff.harbor.standard@example.com', 'qa.staff.harbor.admin@example.com'
)
AND NOT EXISTS (
  SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = company.id
);

INSERT INTO school_contacts (
  school_organization_id, full_name, email, role_title,
  is_primary, is_school_admin, is_scheduler, email_delivery_preference
)
SELECT school.id, CONCAT(u.first_name, ' ', u.last_name), u.email, u.title,
  v.is_primary, v.is_school_admin, v.is_scheduler, 'all_mail'
FROM (
  SELECT 'qa.staff.northridge.admin@example.com' AS email, 'scb-qa-northridge' AS slug, 1 AS is_primary, 1 AS is_school_admin, 0 AS is_scheduler
  UNION ALL SELECT 'qa.staff.northridge.standard@example.com', 'scb-qa-northridge', 0, 0, 0
  UNION ALL SELECT 'qa.staff.westbrook.scheduler@example.com', 'scb-qa-westbrook', 1, 0, 1
  UNION ALL SELECT 'qa.staff.westbrook.admin-scheduler@example.com', 'scb-qa-westbrook', 0, 1, 1
  UNION ALL SELECT 'qa.staff.harbor.standard@example.com', 'scb-qa-harbor', 1, 0, 0
  UNION ALL SELECT 'qa.staff.harbor.admin@example.com', 'scb-qa-harbor', 0, 1, 0
) v
JOIN users u ON u.email = v.email
JOIN agencies school ON school.slug = v.slug AND school.organization_type = 'school'
WHERE NOT EXISTS (
  SELECT 1 FROM school_contacts contact
  WHERE contact.school_organization_id = school.id
    AND LOWER(contact.email) = LOWER(v.email)
);

UPDATE school_contacts contact
JOIN agencies school ON school.id = contact.school_organization_id
JOIN (
  SELECT 'qa.staff.northridge.admin@example.com' AS email, 'scb-qa-northridge' AS slug, 1 AS is_primary, 1 AS is_school_admin, 0 AS is_scheduler
  UNION ALL SELECT 'qa.staff.northridge.standard@example.com', 'scb-qa-northridge', 0, 0, 0
  UNION ALL SELECT 'qa.staff.westbrook.scheduler@example.com', 'scb-qa-westbrook', 1, 0, 1
  UNION ALL SELECT 'qa.staff.westbrook.admin-scheduler@example.com', 'scb-qa-westbrook', 0, 1, 1
  UNION ALL SELECT 'qa.staff.harbor.standard@example.com', 'scb-qa-harbor', 1, 0, 0
  UNION ALL SELECT 'qa.staff.harbor.admin@example.com', 'scb-qa-harbor', 0, 1, 0
) v ON v.slug = school.slug AND LOWER(contact.email) = LOWER(v.email)
SET contact.is_primary = v.is_primary,
    contact.is_school_admin = v.is_school_admin,
    contact.is_scheduler = v.is_scheduler,
    contact.email_delivery_preference = 'all_mail';
