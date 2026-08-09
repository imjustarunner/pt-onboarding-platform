-- Migration 1155: Demo Playground clients, guardians, and provider school-day assignments

SET @demo_playground_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);
SET @demo_school_id = (
  SELECT id FROM agencies WHERE slug = 'demo-school' AND organization_type = 'school' LIMIT 1
);

SET @dp1_id = (SELECT id FROM users WHERE LOWER(email) = 'dp1@demtest.com' LIMIT 1);
SET @dp2_id = (SELECT id FROM users WHERE LOWER(email) = 'dp2@demtest.com' LIMIT 1);
SET @dp3_id = (SELECT id FROM users WHERE LOWER(email) = 'dp3@demtest.com' LIMIT 1);
SET @admin_id = (SELECT id FROM users WHERE LOWER(email) = 'admin@demtest.com' LIMIT 1);
SET @guardian_id = (SELECT id FROM users WHERE LOWER(email) = 'guardian@demtest.com' LIMIT 1);
SET @student1_id = (SELECT id FROM users WHERE LOWER(email) = 'student1@demtest.com' LIMIT 1);
SET @student2_id = (SELECT id FROM users WHERE LOWER(email) = 'student2@demtest.com' LIMIT 1);
SET @student3_id = (SELECT id FROM users WHERE LOWER(email) = 'student3@demtest.com' LIMIT 1);

SET @status_current = (
  SELECT id FROM client_statuses WHERE agency_id = @demo_playground_id AND status_key = 'current' LIMIT 1
);
SET @status_pending = (
  SELECT id FROM client_statuses WHERE agency_id = @demo_playground_id AND status_key = 'pending' LIMIT 1
);
SET @paperwork_emailed = (
  SELECT id FROM paperwork_statuses WHERE agency_id = @demo_playground_id AND status_key = 'emailed_packet' LIMIT 1
);
SET @insurance_medicaid = (
  SELECT id FROM insurance_types WHERE agency_id = @demo_playground_id AND insurance_key = 'medicaid' LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 1) Clients (identifier_code DP-DEMO-## for idempotency)
-- ---------------------------------------------------------------------------
INSERT INTO clients (
  organization_id, agency_id, provider_id,
  full_name, initials, identifier_code,
  status, submission_date, document_status, source, client_type,
  created_by_user_id, client_status_id, paperwork_status_id, insurance_type_id,
  grade, school_year, gender, service_day, guardian_portal_enabled,
  internal_notes, provider_assigned_at
)
SELECT
  @demo_school_id, @demo_playground_id, seed.provider_id,
  seed.full_name, seed.initials, seed.identifier_code,
  'ACTIVE', CURDATE(), 'NONE', 'ADMIN_CREATED', 'school',
  COALESCE(@admin_id, seed.provider_id), @status_current, @paperwork_emailed, @insurance_medicaid,
  seed.grade, seed.school_year, seed.gender, seed.service_day, seed.guardian_portal_enabled,
  seed.internal_notes, NOW()
FROM (
  -- DP1: last-year clients needing provider year update
  SELECT 'Avery Lane' AS full_name, 'AVELAN' AS initials, 'DP-DEMO-01' AS identifier_code,
         @dp1_id AS provider_id, 'K' AS grade, '2025-2026' AS school_year, 'Female' AS gender,
         'Monday' AS service_day, 0 AS guardian_portal_enabled,
         'Last school year client for DP1 — use for provider year update testing.' AS internal_notes
  UNION ALL SELECT 'Blake Ortiz', 'BLAORT', 'DP-DEMO-02', @dp1_id, '1st', '2025-2026', 'Male', 'Wednesday', 0,
         'Last school year client for DP1 — use for provider year update testing.'
  UNION ALL SELECT 'Casey Nguyen', 'CASNGU', 'DP-DEMO-03', @dp1_id, '2nd', '2026-2027', 'Non-binary', 'Monday', 0,
         'Current-year client for DP1.'
  -- DP2: last-year + current
  UNION ALL SELECT 'Drew Patel', 'DREPAT', 'DP-DEMO-04', @dp2_id, '3rd', '2025-2026', 'Male', 'Tuesday', 0,
         'Last school year client for DP2 — use for provider year update testing.'
  UNION ALL SELECT 'Ellis Quinn', 'ELLQUI', 'DP-DEMO-05', @dp2_id, '4th', '2025-2026', 'Female', 'Thursday', 0,
         'Last school year client for DP2 — use for provider year update testing.'
  UNION ALL SELECT 'Finley Brooks', 'FINBRO', 'DP-DEMO-06', @dp2_id, '5th', '2026-2027', 'Female', 'Tuesday', 0,
         'Current-year client for DP2.'
  -- Guardian-linked child (grade 6)
  UNION ALL SELECT 'Harper Diaz', 'HARDIA', 'DP-DEMO-07', @dp1_id, '6th', '2026-2027', 'Female', 'Wednesday', 1,
         'Guardian portal client linked to guardian@demtest.com.'
  -- Self-login students
  UNION ALL SELECT 'Demo Student One', 'DEMST1', 'DP-DEMO-08', @dp2_id, '7th', '2026-2027', 'Male', 'Thursday', 1,
         'Self-login student linked to student1@demtest.com.'
  UNION ALL SELECT 'Demo Student Two', 'DEMST2', 'DP-DEMO-09', @dp1_id, '8th', '2026-2027', 'Female', 'Monday', 1,
         'Self-login student linked to student2@demtest.com.'
  UNION ALL SELECT 'Demo Student Three', 'DEMST3', 'DP-DEMO-10', @dp2_id, 'K', '2026-2027', 'Male', 'Tuesday', 1,
         'Self-login student linked to student3@demtest.com.'
  -- Extra K-8 coverage / collaborative update sample
  UNION ALL SELECT 'Indigo Wells', 'INDWEL', 'DP-DEMO-11', @dp3_id, '3rd', '2026-2027', 'Female', 'Friday', 0,
         'Current-year client assigned to DP3 for supervisor caseload visibility.'
) seed
WHERE @demo_playground_id IS NOT NULL
  AND @demo_school_id IS NOT NULL
  AND seed.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.agency_id = @demo_playground_id AND c.identifier_code = seed.identifier_code
  );

-- ---------------------------------------------------------------------------
-- 2) Organization + provider assignments
-- ---------------------------------------------------------------------------
INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
SELECT c.id, c.organization_id, 1, 1
FROM clients c
WHERE c.agency_id = @demo_playground_id
  AND c.identifier_code LIKE 'DP-DEMO-%'
  AND NOT EXISTS (
    SELECT 1 FROM client_organization_assignments coa
    WHERE coa.client_id = c.id AND coa.organization_id = c.organization_id
  );

INSERT INTO client_provider_assignments (
  client_id, organization_id, provider_user_id, service_day, is_primary, is_active, created_by_user_id
)
SELECT c.id, c.organization_id, c.provider_id, c.service_day, 1, 1, COALESCE(@admin_id, c.provider_id)
FROM clients c
WHERE c.agency_id = @demo_playground_id
  AND c.identifier_code LIKE 'DP-DEMO-%'
  AND c.provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  service_day = VALUES(service_day),
  is_primary = 1,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 3) Guardian / self links
-- ---------------------------------------------------------------------------
INSERT INTO client_guardians (
  client_id, guardian_user_id, relationship_type, relationship_title, access_enabled, created_by_user_id
)
SELECT c.id, @guardian_id, 'guardian', 'Guardian', 1, @admin_id
FROM clients c
WHERE c.agency_id = @demo_playground_id
  AND c.identifier_code = 'DP-DEMO-07'
  AND @guardian_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_guardians cg
    WHERE cg.client_id = c.id AND cg.guardian_user_id = @guardian_id
  );

INSERT INTO client_guardians (
  client_id, guardian_user_id, relationship_type, relationship_title, access_enabled, created_by_user_id
)
SELECT c.id, seed.user_id, 'self', 'Self', 1, @admin_id
FROM clients c
JOIN (
  SELECT 'DP-DEMO-08' AS identifier_code, @student1_id AS user_id
  UNION ALL SELECT 'DP-DEMO-09', @student2_id
  UNION ALL SELECT 'DP-DEMO-10', @student3_id
) seed ON seed.identifier_code = c.identifier_code
WHERE c.agency_id = @demo_playground_id
  AND seed.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_guardians cg
    WHERE cg.client_id = c.id AND cg.guardian_user_id = seed.user_id
  );

-- ---------------------------------------------------------------------------
-- 4) Provider school-day assignments (DP1 Mon/Wed, DP2 Tue/Thu, DP3 Fri)
-- ---------------------------------------------------------------------------
INSERT INTO provider_school_assignments (
  provider_user_id, school_organization_id, day_of_week,
  slots_total, slots_available, start_time, end_time, is_active
)
SELECT seed.provider_id, @demo_school_id, seed.day_of_week,
       6, 4, '08:30:00', '15:00:00', 1
FROM (
  SELECT @dp1_id AS provider_id, 'Monday' AS day_of_week
  UNION ALL SELECT @dp1_id, 'Wednesday'
  UNION ALL SELECT @dp2_id, 'Tuesday'
  UNION ALL SELECT @dp2_id, 'Thursday'
  UNION ALL SELECT @dp3_id, 'Friday'
) seed
WHERE @demo_school_id IS NOT NULL
  AND seed.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM provider_school_assignments psa
    WHERE psa.provider_user_id = seed.provider_id
      AND psa.school_organization_id = @demo_school_id
      AND psa.day_of_week = seed.day_of_week
  );

INSERT INTO school_day_provider_assignments (
  school_organization_id, weekday, provider_user_id, is_active, created_by_user_id
)
SELECT @demo_school_id, seed.weekday, seed.provider_id, 1, COALESCE(@admin_id, seed.provider_id)
FROM (
  SELECT @dp1_id AS provider_id, 'Monday' AS weekday
  UNION ALL SELECT @dp1_id, 'Wednesday'
  UNION ALL SELECT @dp2_id, 'Tuesday'
  UNION ALL SELECT @dp2_id, 'Thursday'
  UNION ALL SELECT @dp3_id, 'Friday'
) seed
WHERE @demo_school_id IS NOT NULL
  AND seed.provider_id IS NOT NULL
  AND COALESCE(@admin_id, seed.provider_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_day_provider_assignments sdpa
    WHERE sdpa.school_organization_id = @demo_school_id
      AND sdpa.weekday = seed.weekday
      AND sdpa.provider_user_id = seed.provider_id
  );
