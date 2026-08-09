-- Migration 1154: Demo Playground test roster users
-- Shared password for all accounts: !@#123QWE
-- bcrypt cost 10 hash embedded below.

SET @demo_password_hash = '$2b$10$E/olSBnzFioQeSXvxCe9je.2sYoPj07ATqZW7o3SVaUdt6k06jnTC';

SET @demo_playground_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);
SET @demo_school_id = (
  SELECT id FROM agencies WHERE slug = 'demo-school' AND organization_type = 'school' LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 1) Upsert roster users (create if missing, refresh password/role flags if present)
-- ---------------------------------------------------------------------------
INSERT INTO users (
  email, username, personal_email, work_email,
  password_hash, password_changed_at, email_verified_at,
  first_name, last_name, role, title, status,
  is_active, is_archived, is_hourly_worker, employment_type,
  has_supervisor_privileges, sso_password_override
)
SELECT v.email, v.email, v.email, v.email,
       @demo_password_hash, NOW(), NOW(),
       v.first_name, v.last_name, v.role, v.title, 'ACTIVE_EMPLOYEE',
       1, 0, v.is_hourly_worker, v.employment_type,
       v.has_supervisor_privileges, 1
FROM (
  SELECT 'dssa@demtest.com' AS email, 'Demo' AS first_name, 'School Admin' AS last_name, 'school_staff' AS role, 'School Administrator' AS title, 0 AS is_hourly_worker, NULL AS employment_type, 0 AS has_supervisor_privileges
  UNION ALL SELECT 'general@demtest.com', 'Demo', 'General Staff', 'school_staff', 'School Staff', 0, NULL, 0
  UNION ALL SELECT 'schoolscheduler@demtest.com', 'Demo', 'School Scheduler', 'school_staff', 'Scheduler', 0, NULL, 0
  UNION ALL SELECT 'dp1@demtest.com', 'Demo', 'Provider One', 'provider', 'Provider', 0, NULL, 0
  UNION ALL SELECT 'dp2@demtest.com', 'Demo', 'Provider Two', 'provider', 'Provider', 0, NULL, 0
  UNION ALL SELECT 'dp3@demtest.com', 'Demo', 'Provider Three', 'supervisor', 'Clinical Supervisor', 0, NULL, 1
  UNION ALL SELECT 'cpa@demtest.com', 'Demo', 'CPA', 'clinical_practice_assistant', 'Clinical Practice Assistant', 0, NULL, 0
  UNION ALL SELECT 'providerplus@demtest.com', 'Demo', 'Provider Plus', 'provider_plus', 'Provider Plus', 0, NULL, 0
  UNION ALL SELECT 'admin@demtest.com', 'Demo', 'Admin', 'admin', 'Administrator', 0, NULL, 0
  UNION ALL SELECT 'tenantscheduler@demtest.com', 'Demo', 'Tenant Scheduler', 'staff', 'Scheduler', 0, NULL, 0
  UNION ALL SELECT 'hourly@demtest.com', 'Demo', 'Hourly Worker', 'staff', 'Hourly Staff', 1, 'hourly', 0
  UNION ALL SELECT 'guardian@demtest.com', 'Demo', 'Guardian', 'client_guardian', 'Guardian', 0, NULL, 0
  UNION ALL SELECT 'student1@demtest.com', 'Demo', 'Student One', 'client_guardian', 'Self', 0, NULL, 0
  UNION ALL SELECT 'student2@demtest.com', 'Demo', 'Student Two', 'client_guardian', 'Self', 0, NULL, 0
  UNION ALL SELECT 'student3@demtest.com', 'Demo', 'Student Three', 'client_guardian', 'Self', 0, NULL, 0
) v
WHERE @demo_playground_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email)
  );

-- Refresh password + key flags for existing roster emails (idempotent re-run safety)
UPDATE users u
JOIN (
  SELECT 'dssa@demtest.com' AS email, 'school_staff' AS role, 'School Administrator' AS title, 0 AS is_hourly_worker, CAST(NULL AS CHAR) AS employment_type, 0 AS has_supervisor_privileges
  UNION ALL SELECT 'general@demtest.com', 'school_staff', 'School Staff', 0, NULL, 0
  UNION ALL SELECT 'schoolscheduler@demtest.com', 'school_staff', 'Scheduler', 0, NULL, 0
  UNION ALL SELECT 'dp1@demtest.com', 'provider', 'Provider', 0, NULL, 0
  UNION ALL SELECT 'dp2@demtest.com', 'provider', 'Provider', 0, NULL, 0
  UNION ALL SELECT 'dp3@demtest.com', 'supervisor', 'Clinical Supervisor', 0, NULL, 1
  UNION ALL SELECT 'cpa@demtest.com', 'clinical_practice_assistant', 'Clinical Practice Assistant', 0, NULL, 0
  UNION ALL SELECT 'providerplus@demtest.com', 'provider_plus', 'Provider Plus', 0, NULL, 0
  UNION ALL SELECT 'admin@demtest.com', 'admin', 'Administrator', 0, NULL, 0
  UNION ALL SELECT 'tenantscheduler@demtest.com', 'staff', 'Scheduler', 0, NULL, 0
  UNION ALL SELECT 'hourly@demtest.com', 'staff', 'Hourly Staff', 1, 'hourly', 0
  UNION ALL SELECT 'guardian@demtest.com', 'client_guardian', 'Guardian', 0, NULL, 0
  UNION ALL SELECT 'student1@demtest.com', 'client_guardian', 'Self', 0, NULL, 0
  UNION ALL SELECT 'student2@demtest.com', 'client_guardian', 'Self', 0, NULL, 0
  UNION ALL SELECT 'student3@demtest.com', 'client_guardian', 'Self', 0, NULL, 0
) v ON LOWER(u.email) = LOWER(v.email)
SET
  u.password_hash = @demo_password_hash,
  u.password_changed_at = NOW(),
  u.temporary_password_hash = NULL,
  u.temporary_password_expires_at = NULL,
  u.email_verified_at = COALESCE(u.email_verified_at, NOW()),
  u.username = COALESCE(u.username, v.email),
  u.role = v.role,
  u.title = v.title,
  u.status = 'ACTIVE_EMPLOYEE',
  u.is_active = 1,
  u.is_archived = 0,
  u.is_hourly_worker = v.is_hourly_worker,
  u.employment_type = v.employment_type,
  u.has_supervisor_privileges = v.has_supervisor_privileges,
  u.sso_password_override = 1,
  u.failed_login_attempts = 0,
  u.locked_until = NULL;

-- ---------------------------------------------------------------------------
-- 2) Memberships: all roster users -> Demo Playground tenant
-- ---------------------------------------------------------------------------
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @demo_playground_id, 1
FROM users u
WHERE @demo_playground_id IS NOT NULL
  AND LOWER(u.email) IN (
    'dssa@demtest.com', 'general@demtest.com', 'schoolscheduler@demtest.com',
    'dp1@demtest.com', 'dp2@demtest.com', 'dp3@demtest.com',
    'cpa@demtest.com', 'providerplus@demtest.com', 'admin@demtest.com',
    'tenantscheduler@demtest.com', 'hourly@demtest.com',
    'guardian@demtest.com', 'student1@demtest.com', 'student2@demtest.com', 'student3@demtest.com'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @demo_playground_id
  );

-- School staff + providers also membership on Demo K-8 School
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @demo_school_id, 1
FROM users u
WHERE @demo_school_id IS NOT NULL
  AND LOWER(u.email) IN (
    'dssa@demtest.com', 'general@demtest.com', 'schoolscheduler@demtest.com',
    'dp1@demtest.com', 'dp2@demtest.com', 'dp3@demtest.com',
    'guardian@demtest.com', 'student1@demtest.com', 'student2@demtest.com', 'student3@demtest.com'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @demo_school_id
  );

-- ---------------------------------------------------------------------------
-- 3) school_contacts flags (admin / general / scheduler)
-- ---------------------------------------------------------------------------
INSERT INTO school_contacts (
  school_organization_id, full_name, email, role_title,
  is_primary, is_school_admin, is_scheduler
)
SELECT
  @demo_school_id,
  CONCAT(u.first_name, ' ', u.last_name),
  u.email,
  u.title,
  CASE WHEN LOWER(u.email) = 'dssa@demtest.com' THEN 1 ELSE 0 END,
  CASE WHEN LOWER(u.email) = 'dssa@demtest.com' THEN 1 ELSE 0 END,
  CASE WHEN LOWER(u.email) = 'schoolscheduler@demtest.com' THEN 1 ELSE 0 END
FROM users u
WHERE @demo_school_id IS NOT NULL
  AND LOWER(u.email) IN ('dssa@demtest.com', 'general@demtest.com', 'schoolscheduler@demtest.com')
  AND NOT EXISTS (
    SELECT 1 FROM school_contacts sc
    WHERE sc.school_organization_id = @demo_school_id
      AND LOWER(sc.email) COLLATE utf8mb4_unicode_ci = LOWER(u.email) COLLATE utf8mb4_unicode_ci
  );

UPDATE school_contacts sc
JOIN users u
  ON LOWER(sc.email) COLLATE utf8mb4_unicode_ci = LOWER(u.email) COLLATE utf8mb4_unicode_ci
SET
  sc.is_primary = CASE WHEN LOWER(u.email) = 'dssa@demtest.com' THEN 1 ELSE 0 END,
  sc.is_school_admin = CASE WHEN LOWER(u.email) = 'dssa@demtest.com' THEN 1 ELSE 0 END,
  sc.is_scheduler = CASE WHEN LOWER(u.email) = 'schoolscheduler@demtest.com' THEN 1 ELSE 0 END,
  sc.role_title = u.title,
  sc.full_name = CONCAT(u.first_name, ' ', u.last_name),
  sc.updated_at = NOW()
WHERE sc.school_organization_id = @demo_school_id
  AND LOWER(u.email) IN ('dssa@demtest.com', 'general@demtest.com', 'schoolscheduler@demtest.com');

-- ---------------------------------------------------------------------------
-- 4) DP3 supervises DP1 (clinical, primary)
-- ---------------------------------------------------------------------------
INSERT INTO supervisor_assignments (
  supervisor_id, supervisee_id, agency_id, supervisor_type, is_primary, created_by_user_id
)
SELECT
  sup.id, sub.id, @demo_playground_id, 'clinical', 1, admin_u.id
FROM users sup
JOIN users sub ON LOWER(sub.email) = 'dp1@demtest.com'
JOIN users admin_u ON LOWER(admin_u.email) = 'admin@demtest.com'
WHERE LOWER(sup.email) = 'dp3@demtest.com'
  AND @demo_playground_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM supervisor_assignments sa
    WHERE sa.supervisor_id = sup.id
      AND sa.supervisee_id = sub.id
      AND sa.agency_id = @demo_playground_id
      AND sa.supervisor_type = 'clinical'
  );
