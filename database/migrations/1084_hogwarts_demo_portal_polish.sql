-- Migration 1084: Polish Hogwarts school portal demo data for sales / onboarding demos.
-- Removes non-demo providers & staff, rebuilds weekday coverage, assigns clients,
-- seeds sample school events / public docs / announcements, and makes McGonagall school admin.

SET @hogwarts_id := (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 1) Remove Michael Williams, Piper Finch, Loriana Pincente from Hogwarts days
-- ---------------------------------------------------------------------------
UPDATE provider_school_assignments
SET is_active = FALSE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id IN (595, 596, 601);

UPDATE school_day_provider_assignments
SET is_active = FALSE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id IN (595, 596, 601);

-- ---------------------------------------------------------------------------
-- 2) Remove Skylar Driver + Filius Flitwick from Hogwarts school staff
-- ---------------------------------------------------------------------------
DELETE FROM user_agencies
WHERE agency_id = @hogwarts_id
  AND user_id IN (749, 1016);

DELETE FROM school_contacts
WHERE school_organization_id = @hogwarts_id
  AND email IN ('skyler@d11.org', 'filius.flitwick@hogwarts.edu');

-- ---------------------------------------------------------------------------
-- 3) Rebuild Order of the Phoenix provider day coverage
--    Mon: 2, Tue: 1, Wed: 0, Thu: 1, Fri: 2 (one half-day with 4 slots)
--    Providers: Sirius 1007, Tonks 1008, Kingsley 1009, Moody 1010
-- ---------------------------------------------------------------------------
UPDATE provider_school_assignments
SET is_active = FALSE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id IN (1007, 1008, 1009, 1010);

UPDATE school_day_provider_assignments
SET is_active = FALSE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id IN (1007, 1008, 1009, 1010);

-- Helper: upsert PSA row
-- Monday: Sirius (6) + Tonks (7)
INSERT INTO provider_school_assignments
  (school_organization_id, provider_user_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active, created_at, updated_at)
VALUES
  (@hogwarts_id, 1007, 'Monday', 6, 6, '08:00:00', '15:00:00', TRUE, NOW(), NOW()),
  (@hogwarts_id, 1008, 'Monday', 7, 7, '08:00:00', '15:00:00', TRUE, NOW(), NOW()),
  (@hogwarts_id, 1010, 'Tuesday', 5, 5, '08:00:00', '15:00:00', TRUE, NOW(), NOW()),
  (@hogwarts_id, 1009, 'Thursday', 6, 6, '08:00:00', '15:00:00', TRUE, NOW(), NOW()),
  (@hogwarts_id, 1007, 'Friday', 4, 4, '08:00:00', '12:00:00', TRUE, NOW(), NOW()),
  (@hogwarts_id, 1008, 'Friday', 5, 5, '08:00:00', '15:00:00', TRUE, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  slots_total = VALUES(slots_total),
  slots_available = VALUES(slots_available),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO school_day_provider_assignments
  (school_organization_id, provider_user_id, weekday, is_active, created_by_user_id, created_at, updated_at)
VALUES
  (@hogwarts_id, 1007, 'Monday', TRUE, 1015, NOW(), NOW()),
  (@hogwarts_id, 1008, 'Monday', TRUE, 1015, NOW(), NOW()),
  (@hogwarts_id, 1010, 'Tuesday', TRUE, 1015, NOW(), NOW()),
  (@hogwarts_id, 1009, 'Thursday', TRUE, 1015, NOW(), NOW()),
  (@hogwarts_id, 1007, 'Friday', TRUE, 1015, NOW(), NOW()),
  (@hogwarts_id, 1008, 'Friday', TRUE, 1015, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  is_active = TRUE,
  updated_at = NOW();

-- Ensure weekday schedule flags exist for Mon/Tue/Thu/Fri
INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id, created_at, updated_at)
SELECT @hogwarts_id, d.weekday, TRUE, 1015, NOW(), NOW()
FROM (
  SELECT 'Monday' AS weekday UNION ALL
  SELECT 'Tuesday' UNION ALL
  SELECT 'Thursday' UNION ALL
  SELECT 'Friday'
) d
WHERE @hogwarts_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = TRUE, updated_at = NOW();

UPDATE school_day_schedules
SET is_active = FALSE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND weekday = 'Wednesday';

-- ---------------------------------------------------------------------------
-- 4) Assign every active Hogwarts client to remaining providers
-- ---------------------------------------------------------------------------
DELETE FROM client_provider_assignments
WHERE organization_id = @hogwarts_id;

-- Distribute clients across remaining providers / days
UPDATE clients SET provider_id = 1007, service_day = 'Monday'
WHERE organization_id = @hogwarts_id AND id IN (1181, 1332, 1425, 1671);

UPDATE clients SET provider_id = 1008, service_day = 'Monday'
WHERE organization_id = @hogwarts_id AND id IN (1326, 1349);

UPDATE clients SET provider_id = 1008, service_day = 'Friday'
WHERE organization_id = @hogwarts_id AND id IN (1334, 1348);

UPDATE clients SET provider_id = 1010, service_day = 'Tuesday'
WHERE organization_id = @hogwarts_id AND id IN (1327, 1328, 1424);

UPDATE clients SET provider_id = 1009, service_day = 'Thursday'
WHERE organization_id = @hogwarts_id AND id IN (1331, 1333, 1350, 1672, 1673);

INSERT INTO client_provider_assignments
  (organization_id, client_id, provider_user_id, service_day, is_primary, is_active, created_at, updated_at)
SELECT c.organization_id, c.id, c.provider_id, c.service_day, TRUE, TRUE, NOW(), NOW()
FROM clients c
WHERE c.organization_id = @hogwarts_id
  AND c.provider_id IS NOT NULL
  AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED';

-- Recompute slots_available from active assignments (best-effort)
UPDATE provider_school_assignments psa
JOIN (
  SELECT provider_user_id, service_day AS day_of_week, COUNT(*) AS used
  FROM client_provider_assignments
  WHERE organization_id = @hogwarts_id AND is_active = TRUE
  GROUP BY provider_user_id, service_day
) u ON u.provider_user_id = psa.provider_user_id
   AND u.day_of_week COLLATE utf8mb4_unicode_ci = psa.day_of_week COLLATE utf8mb4_unicode_ci
SET psa.slots_available = GREATEST(0, COALESCE(psa.slots_total, 0) - u.used),
    psa.updated_at = NOW()
WHERE psa.school_organization_id = @hogwarts_id
  AND psa.is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 5) School admin: Minerva McGonagall is primary school admin (demo login identity)
-- ---------------------------------------------------------------------------
UPDATE school_contacts
SET is_primary = 0, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id;

UPDATE school_contacts
SET is_primary = 1, is_school_admin = 1, is_scheduler = 0, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND email = 'minerva.mcgonagall@hogwarts.edu';

-- ---------------------------------------------------------------------------
-- 6) Sample public documents (links)
-- ---------------------------------------------------------------------------
DELETE FROM school_public_documents
WHERE school_organization_id = @hogwarts_id
  AND title IN (
    'Hogwarts Family Handbook',
    'School Portal Quick Start Guide',
    'ITSCO Services Overview'
  );

INSERT INTO school_public_documents
  (school_organization_id, kind, title, category_key, link_url, created_at, updated_at)
VALUES
  (@hogwarts_id, 'link', 'Hogwarts Family Handbook', 'handbook', 'https://example.com/hogwarts-family-handbook', NOW(), NOW()),
  (@hogwarts_id, 'link', 'School Portal Quick Start Guide', 'other', 'https://example.com/school-portal-quick-start', NOW(), NOW()),
  (@hogwarts_id, 'link', 'ITSCO Services Overview', 'other', 'https://itsco.health', NOW(), NOW());

-- ---------------------------------------------------------------------------
-- 7) Sample school portal announcements (notifications feed source)
-- ---------------------------------------------------------------------------
DELETE FROM school_portal_announcements
WHERE organization_id = @hogwarts_id
  AND title IN (
    'Welcome to the Hogwarts school portal demo',
    'Provider schedule updated for this week',
    'Reminder: Back to School night next Friday'
  );

INSERT INTO school_portal_announcements
  (organization_id, created_by_user_id, title, message, display_type, audience, starts_at, ends_at, created_at, updated_at)
VALUES
  (@hogwarts_id, 1015, 'Welcome to the Hogwarts school portal demo',
   'Browse freely — this is a view-only preview of what your school portal will look like.',
   'announcement', 'everyone', NOW() - INTERVAL 2 DAY, NOW() + INTERVAL 30 DAY, NOW() - INTERVAL 2 DAY, NOW()),
  (@hogwarts_id, 1015, 'Provider schedule updated for this week',
   'Monday and Friday have two providers on campus. Wednesday has no school-based coverage.',
   'announcement', 'everyone', NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 14 DAY, NOW() - INTERVAL 1 DAY, NOW()),
  (@hogwarts_id, 1015, 'Reminder: Back to School night next Friday',
   'Families are invited to meet providers in the Great Hall from 5–7pm.',
   'announcement', 'everyone', NOW(), NOW() + INTERVAL 21 DAY, NOW(), NOW());

-- ---------------------------------------------------------------------------
-- 8) Sample school events on the calendar (company_events school_* types)
-- ---------------------------------------------------------------------------
DELETE FROM company_events
WHERE organization_id = @hogwarts_id
  AND title IN (
    'Back to School Night',
    'Fall School Check-in',
    'First Day of School',
    'Family Resource Fair'
  )
  AND event_type LIKE 'school_%';

INSERT INTO company_events
  (agency_id, organization_id, created_by_user_id, updated_by_user_id, title, description,
   event_type, starts_at, ends_at, timezone, is_active, school_event_status, created_at, updated_at)
VALUES
  (2, @hogwarts_id, 1015, 1015, 'Back to School Night',
   'Meet your school providers and learn how the portal works.',
   'school_back_to_school',
   CONCAT(YEAR(CURDATE()), '-08-15 17:00:00'),
   CONCAT(YEAR(CURDATE()), '-08-15 19:00:00'),
   'America/Denver', 1, 'scheduled', NOW(), NOW()),
  (2, @hogwarts_id, 1015, 1015, 'Fall School Check-in',
   'Mid-semester check-in for caseload and paperwork status.',
   'school_fall_check_in',
   CONCAT(YEAR(CURDATE()), '-10-10 08:00:00'),
   CONCAT(YEAR(CURDATE()), '-10-10 12:00:00'),
   'America/Denver', 1, 'scheduled', NOW(), NOW()),
  (2, @hogwarts_id, 1015, 1015, 'First Day of School',
   'First day of the school year.',
   'school_first_day',
   CONCAT(YEAR(CURDATE()), '-08-12 08:00:00'),
   CONCAT(YEAR(CURDATE()), '-08-12 15:00:00'),
   'America/Denver', 1, 'scheduled', NOW(), NOW()),
  (2, @hogwarts_id, 1015, 1015, 'Family Resource Fair',
   'Tables for families to learn about available school-based services.',
   'school_resource_fair',
   CONCAT(YEAR(CURDATE()), '-09-20 10:00:00'),
   CONCAT(YEAR(CURDATE()), '-09-20 14:00:00'),
   'America/Denver', 1, 'scheduled', NOW(), NOW());
