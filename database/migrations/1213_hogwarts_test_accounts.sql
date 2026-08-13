-- Migration 1213: Hogwarts test-account switcher + guardian logins
-- Fake Hogwarts people stay on character emails; outbound mail is redirected
-- in application code to testing@itsco.health. Williams, Chuckie, and Piper stay real.

ALTER TABLE demo_test_accounts
  ADD COLUMN account_group VARCHAR(32) NOT NULL DEFAULT 'demo'
    COMMENT 'demo = Demo Playground roster; hogwarts = ITSCO Hogwarts school testers'
    AFTER label;

ALTER TABLE demo_test_accounts
  ADD KEY idx_demo_test_accounts_group_sort (account_group, is_active, sort_order);

UPDATE demo_test_accounts
SET account_group = 'demo'
WHERE account_group IS NULL OR account_group = '';

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

SET @demo_password_hash = '$2b$10$E/olSBnzFioQeSXvxCe9je.2sYoPj07ATqZW7o3SVaUdt6k06jnTC';

-- ---------------------------------------------------------------------------
-- Guardian logins for Hogwarts students (max 5)
-- ---------------------------------------------------------------------------
INSERT INTO users (
  email, username, personal_email, work_email,
  password_hash, password_changed_at, email_verified_at,
  first_name, last_name, role, title, status,
  is_active, is_archived, sso_password_override
)
SELECT v.email, v.email, v.email, NULL,
       @demo_password_hash, NOW(), NOW(),
       v.first_name, v.last_name, 'client_guardian', 'Guardian', 'ACTIVE_EMPLOYEE',
       1, 0, 1
FROM (
  SELECT 'lily.potter@hogwarts.edu' AS email, 'Lily' AS first_name, 'Potter' AS last_name
  UNION ALL SELECT 'molly.weasley.guardian@hogwarts.edu', 'Molly', 'Weasley'
  UNION ALL SELECT 'jean.granger@hogwarts.edu', 'Jean', 'Granger'
  UNION ALL SELECT 'xenophilius.lovegood@hogwarts.edu', 'Xenophilius', 'Lovegood'
  UNION ALL SELECT 'narcissa.malfoy@hogwarts.edu', 'Narcissa', 'Malfoy'
) v
WHERE @hogwarts_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email)
  );

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT u.id, @hogwarts_id, 1
FROM users u
WHERE @hogwarts_id IS NOT NULL
  AND LOWER(u.email) IN (
    'lily.potter@hogwarts.edu',
    'molly.weasley.guardian@hogwarts.edu',
    'jean.granger@hogwarts.edu',
    'xenophilius.lovegood@hogwarts.edu',
    'narcissa.malfoy@hogwarts.edu'
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua
    WHERE ua.user_id = u.id AND ua.agency_id = @hogwarts_id
  );

INSERT INTO client_guardians (
  client_id, guardian_user_id, relationship_type, relationship_title,
  access_enabled, permissions_json, created_at
)
SELECT c.id, u.id, 'guardian', v.title, 1,
       JSON_OBJECT(
         'canMessage', true,
         'canSignDocs', true,
         'canViewDocs', true,
         'canViewLinks', true,
         'canViewProgress', true
       ),
       NOW()
FROM (
  SELECT 'lily.potter@hogwarts.edu' AS email, 'Harry Potter' AS client_name, 'Mother' AS title
  UNION ALL SELECT 'molly.weasley.guardian@hogwarts.edu', 'Ron Weasley', 'Mother'
  UNION ALL SELECT 'jean.granger@hogwarts.edu', 'Hermione Granger', 'Mother'
  UNION ALL SELECT 'xenophilius.lovegood@hogwarts.edu', 'Luna Lovegood', 'Father'
  UNION ALL SELECT 'narcissa.malfoy@hogwarts.edu', 'Draco Malfoy', 'Mother'
) v
JOIN users u ON LOWER(u.email) = LOWER(v.email)
JOIN clients c ON c.organization_id = @hogwarts_id
  AND c.full_name = v.client_name
  AND c.identifier_code NOT LIKE 'MW-%'
WHERE @hogwarts_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_guardians cg
    WHERE cg.client_id = c.id AND cg.guardian_user_id = u.id
  );

-- ---------------------------------------------------------------------------
-- Allowlist named Hogwarts testers (no admin, no Williams/Chuckie/Piper)
-- ---------------------------------------------------------------------------
INSERT INTO demo_test_accounts (user_id, label, account_group, sort_order, is_active)
SELECT u.id, v.label, 'hogwarts', v.sort_order, 1
FROM (
  SELECT 'minerva.mcgonagall@hogwarts.edu' AS email, 'Minerva McGonagall' AS label, 200 AS sort_order
  UNION ALL SELECT 'severus.snape@hogwarts.edu', 'Severus Snape', 201
  UNION ALL SELECT 'argus.filch@hogwarts.edu', 'Argus Filch', 202
  UNION ALL SELECT 'pomona.sprout@hogwarts.edu', 'Pomona Sprout', 203
  UNION ALL SELECT 'horace.slughorn@hogwarts.edu', 'Horace Slughorn', 204
  UNION ALL SELECT 'order.sirius.black@itsco.health', 'Sirius Black', 210
  UNION ALL SELECT 'order.nymphadora.tonks@itsco.health', 'Nymphadora Tonks', 211
  UNION ALL SELECT 'order.kingsley.shacklebolt@itsco.health', 'Kingsley Shacklebolt', 212
  UNION ALL SELECT 'order.alastor.moody@itsco.health', 'Alastor Moody', 213
  UNION ALL SELECT 'lily.potter@hogwarts.edu', 'Lily Potter', 220
  UNION ALL SELECT 'molly.weasley.guardian@hogwarts.edu', 'Molly Weasley', 221
  UNION ALL SELECT 'jean.granger@hogwarts.edu', 'Jean Granger', 222
  UNION ALL SELECT 'xenophilius.lovegood@hogwarts.edu', 'Xenophilius Lovegood', 223
  UNION ALL SELECT 'narcissa.malfoy@hogwarts.edu', 'Narcissa Malfoy', 224
) v
JOIN users u ON LOWER(u.email) = LOWER(v.email)
WHERE NOT EXISTS (
  SELECT 1 FROM demo_test_accounts dta WHERE dta.user_id = u.id
);
