-- Migration 1083: Demo clients for provider Michael Williams
-- Adds office clients (active + pending), pending school clients, and Client Exchange listings.

SET @provider_id = (
  SELECT id FROM users WHERE email = 'williams@itsco.health' LIMIT 1
);

SET @agency_id = (
  SELECT id FROM agencies WHERE slug = 'itsco' AND organization_type = 'agency' LIMIT 1
);

SET @hogwarts_id = (
  SELECT id FROM agencies WHERE slug = 'hogwarts' AND organization_type = 'school' LIMIT 1
);

SET @status_current = (
  SELECT id FROM client_statuses WHERE agency_id = @agency_id AND status_key = 'current' LIMIT 1
);

SET @status_pending = (
  SELECT id FROM client_statuses WHERE agency_id = @agency_id AND status_key = 'pending' LIMIT 1
);

SET @status_packet = (
  SELECT id FROM client_statuses WHERE agency_id = @agency_id AND status_key = 'packet' LIMIT 1
);

SET @status_screener = (
  SELECT id FROM client_statuses WHERE agency_id = @agency_id AND status_key = 'screener' LIMIT 1
);

SET @status_prospective = (
  SELECT id FROM client_statuses WHERE agency_id = @agency_id AND status_key = 'prospective' LIMIT 1
);

SET @paperwork_emailed = (
  SELECT id FROM paperwork_statuses WHERE agency_id = @agency_id AND status_key = 'emailed_packet' LIMIT 1
);

SET @paperwork_new_docs = (
  SELECT id FROM paperwork_statuses WHERE agency_id = @agency_id AND status_key = 'new_docs' LIMIT 1
);

SET @insurance_medicaid = (
  SELECT id FROM insurance_types WHERE agency_id = @agency_id AND insurance_key = 'medicaid' LIMIT 1
);

SET @insurance_commercial = (
  SELECT id FROM insurance_types WHERE agency_id = @agency_id AND insurance_key = 'commercial_other' LIMIT 1
);

SET @insurance_self_pay = (
  SELECT id FROM insurance_types WHERE agency_id = @agency_id AND insurance_key = 'self_pay' LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 1) Office clients — active caseload
-- ---------------------------------------------------------------------------
INSERT INTO clients (
  organization_id, agency_id, provider_id, full_name, initials, identifier_code,
  status, submission_date, document_status, source, client_type, created_by_user_id,
  client_status_id, paperwork_status_id, insurance_type_id,
  contact_phone, gender, service_day, provider_assigned_at,
  address_city, address_state, address_zip, primary_client_language,
  internal_notes
)
SELECT
  @agency_id, @agency_id, @provider_id, seed.full_name, seed.initials, seed.identifier_code,
  'ACTIVE', CURDATE(), 'NONE', 'ADMIN_CREATED', seed.client_type, @provider_id,
  @status_current, @paperwork_emailed, seed.insurance_type_id,
  seed.contact_phone, seed.gender, seed.service_day, NOW(),
  seed.address_city, 'CO', seed.address_zip, 'English',
  'Demo office client for Michael Williams provider walkthrough.'
FROM (
  SELECT 'Liam Carter' AS full_name, 'LIC' AS initials, 'MW-OFC-01' AS identifier_code,
         'clinical' AS client_type, @insurance_medicaid AS insurance_type_id,
         '(719) 555-0142' AS contact_phone, 'Male' AS gender, 'Tuesday' AS service_day,
         'Colorado Springs' AS address_city, '80903' AS address_zip
  UNION ALL SELECT 'Maya Rodriguez', 'MAR', 'MW-OFC-02', 'clinical', @insurance_commercial,
         '(719) 555-0187', 'Female', 'Wednesday', 'Colorado Springs', '80904'
  UNION ALL SELECT 'Sophia Chen', 'SOC', 'MW-OFC-03', 'learning', @insurance_self_pay,
         '(719) 555-0221', 'Female', 'Thursday', 'Monument', '80132'
  UNION ALL SELECT 'Ethan Brooks', 'EAB', 'MW-OFC-04', 'clinical', @insurance_medicaid,
         '(719) 555-0264', 'Male', 'Friday', 'Fountain', '80817'
) seed
WHERE @provider_id IS NOT NULL
  AND @agency_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.agency_id = @agency_id AND c.identifier_code = seed.identifier_code
  );

-- ---------------------------------------------------------------------------
-- 2) Office clients — pending (New Clients queue)
-- ---------------------------------------------------------------------------
INSERT INTO clients (
  organization_id, agency_id, provider_id, full_name, initials, identifier_code,
  status, submission_date, document_status, source, client_type, created_by_user_id,
  client_status_id, paperwork_status_id, insurance_type_id,
  contact_phone, gender, service_day, provider_assigned_at,
  intake_preferences_json, internal_notes
)
SELECT
  @agency_id, @agency_id, @provider_id, seed.full_name, seed.initials, seed.identifier_code,
  seed.workflow_status, CURDATE(), 'NONE', 'PUBLIC_OFFICE_INTAKE', seed.client_type, @provider_id,
  seed.client_status_id, @paperwork_new_docs, seed.insurance_type_id,
  seed.contact_phone, seed.gender, seed.service_day, NOW(),
  seed.intake_preferences_json,
  'Demo pending office client for Michael Williams New Clients walkthrough.'
FROM (
  SELECT 'Jordan Taylor' AS full_name, 'JOT' AS initials, 'MW-OFC-05' AS identifier_code,
         'clinical' AS client_type, 'PACKET' AS workflow_status, @status_packet AS client_status_id,
         @insurance_commercial AS insurance_type_id, '(719) 555-0301' AS contact_phone,
         'Non-binary' AS gender, 'Monday' AS service_day,
         JSON_OBJECT(
           'preferredDays', JSON_ARRAY('Monday', 'Wednesday'),
           'preferredTimeOfDay', 'afternoon',
           'preferredModality', 'virtual',
           'presentingConcern', 'Anxiety and school avoidance',
           'insuranceOrPayment', 'Commercial insurance'
         ) AS intake_preferences_json
  UNION ALL SELECT 'Ava Mitchell', 'AVM', 'MW-OFC-06', 'clinical', 'SCREENER', @status_screener,
         @insurance_medicaid, '(719) 555-0348', 'Female', 'Tuesday',
         JSON_OBJECT(
           'preferredDays', JSON_ARRAY('Tuesday', 'Thursday'),
           'preferredTimeOfDay', 'morning',
           'preferredModality', 'in_person',
           'presentingConcern', 'Depression screening referral',
           'insuranceOrPayment', 'Medicaid'
         )
  UNION ALL SELECT 'Noah Parker', 'NOP', 'MW-OFC-07', 'learning', 'PACKET', @status_prospective,
         @insurance_self_pay, '(719) 555-0392', 'Male', 'Wednesday',
         JSON_OBJECT(
           'preferredDays', JSON_ARRAY('Wednesday'),
           'preferredTimeOfDay', 'after_school',
           'preferredModality', 'either',
           'presentingConcern', 'Math tutoring and executive function support',
           'insuranceOrPayment', 'Self pay'
         )
) seed
WHERE @provider_id IS NOT NULL
  AND @agency_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.agency_id = @agency_id AND c.identifier_code = seed.identifier_code
  );

-- ---------------------------------------------------------------------------
-- 3) School clients — pending (New Clients queue at Hogwarts)
-- ---------------------------------------------------------------------------
INSERT INTO clients (
  organization_id, agency_id, provider_id, full_name, initials, identifier_code,
  status, submission_date, document_status, source, client_type, created_by_user_id,
  client_status_id, paperwork_status_id, insurance_type_id,
  grade, school_year, gender, service_day, internal_notes
)
SELECT
  @hogwarts_id, @agency_id, @provider_id, seed.full_name, seed.initials, seed.identifier_code,
  seed.workflow_status, CURDATE(), 'NONE', 'ADMIN_CREATED', 'school', @provider_id,
  seed.client_status_id, @paperwork_new_docs, @insurance_medicaid,
  seed.grade, '2025-2026', seed.gender, seed.service_day,
  'Demo pending school client for Michael Williams New Clients walkthrough.'
FROM (
  SELECT 'Luna Lovegood' AS full_name, 'LOLLOV' AS initials, 'MW-SCH-01' AS identifier_code,
         'PENDING_REVIEW' AS workflow_status, @status_pending AS client_status_id,
         '10th' AS grade, 'Female' AS gender, 'Monday' AS service_day
  UNION ALL SELECT 'Dean Thomas', 'DEATHO', 'MW-SCH-02', 'PENDING_REVIEW', @status_pending,
         '11th', 'Male', 'Tuesday'
  UNION ALL SELECT 'Seamus Finnigan', 'SEAFIN', 'MW-SCH-03', 'PACKET', @status_screener,
         '10th', 'Male', 'Thursday'
) seed
WHERE @provider_id IS NOT NULL
  AND @agency_id IS NOT NULL
  AND @hogwarts_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.agency_id = @agency_id AND c.identifier_code = seed.identifier_code
  );

-- ---------------------------------------------------------------------------
-- 4) Organization + provider assignments
-- ---------------------------------------------------------------------------
INSERT INTO client_organization_assignments (client_id, organization_id, is_active)
SELECT c.id, c.organization_id, TRUE
FROM clients c
WHERE c.agency_id = @agency_id
  AND c.identifier_code IN (
    'MW-OFC-01', 'MW-OFC-02', 'MW-OFC-03', 'MW-OFC-04',
    'MW-OFC-05', 'MW-OFC-06', 'MW-OFC-07',
    'MW-SCH-01', 'MW-SCH-02', 'MW-SCH-03'
  )
  AND NOT EXISTS (
    SELECT 1 FROM client_organization_assignments coa
    WHERE coa.client_id = c.id AND coa.organization_id = c.organization_id
  );

INSERT INTO client_provider_assignments (
  client_id, organization_id, provider_user_id, service_day, is_primary, is_active, created_by_user_id
)
SELECT c.id, c.organization_id, @provider_id, c.service_day, TRUE, TRUE, @provider_id
FROM clients c
WHERE c.agency_id = @agency_id
  AND c.provider_id = @provider_id
  AND c.identifier_code IN (
    'MW-OFC-01', 'MW-OFC-02', 'MW-OFC-03', 'MW-OFC-04',
    'MW-OFC-05', 'MW-OFC-06', 'MW-OFC-07',
    'MW-SCH-01', 'MW-SCH-02', 'MW-SCH-03'
  )
  AND @provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  service_day = VALUES(service_day),
  is_primary = TRUE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 5) Client Exchange listings (3 active office clients)
-- ---------------------------------------------------------------------------
INSERT INTO client_exchange_listings (
  agency_id, client_id, posted_by_user_id, current_provider_user_id, status,
  demographics_json, presenting_problems_json, diagnoses_json, preferences_json, notes
)
SELECT
  @agency_id,
  c.id,
  @provider_id,
  @provider_id,
  'open',
  seed.demographics_json,
  seed.presenting_problems_json,
  seed.diagnoses_json,
  seed.preferences_json,
  seed.notes
FROM clients c
JOIN (
  SELECT 'MW-OFC-01' AS identifier_code,
         JSON_OBJECT('ageBand', '14-17', 'gender', 'Male', 'generalLocation', 'Colorado Springs area') AS demographics_json,
         JSON_ARRAY('Generalized anxiety', 'School avoidance') AS presenting_problems_json,
         JSON_ARRAY('F41.1') AS diagnoses_json,
         JSON_OBJECT('modality', 'virtual', 'availability', 'Tue/Wed afternoons', 'insurance', 'Medicaid') AS preferences_json,
         'Schedule conflict — provider relocating caseload. Seeking consistent virtual placement.' AS notes
  UNION ALL SELECT 'MW-OFC-02',
         JSON_OBJECT('ageBand', '18-25', 'gender', 'Female', 'generalLocation', 'South Colorado Springs'),
         JSON_ARRAY('Depression', 'Relationship stress'),
         JSON_ARRAY('F32.1'),
         JSON_OBJECT('modality', 'in_person', 'availability', 'Wed mornings', 'insurance', 'Commercial'),
         'Client needs in-person continuity near south side. Warm handoff preferred.'
  UNION ALL SELECT 'MW-OFC-03',
         JSON_OBJECT('ageBand', '12-14', 'gender', 'Female', 'generalLocation', 'Monument / Tri-Lakes'),
         JSON_ARRAY('Academic support', 'Executive function'),
         JSON_ARRAY(),
         JSON_OBJECT('modality', 'either', 'availability', 'Thu after school', 'insurance', 'Self pay'),
         'Learning support client — looking for tutor with EF coaching experience.'
) seed ON seed.identifier_code = c.identifier_code
WHERE @provider_id IS NOT NULL
  AND @agency_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_exchange_listings cel
    WHERE cel.client_id = c.id AND cel.status IN ('open', 'requested')
  );
