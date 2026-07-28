-- Migration 1087: Restore Michael Williams, Piper Finch, and Chuckie Sullivan on Hogwarts
-- for the regular school portal, while keeping Order of the Phoenix demo polish
-- (days, clients, soft schedules, events, docs, announcements).
-- Public onboarding demo still hides these accounts via the demo API layer.

SET @hogwarts_id := (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

SET @admin_user := 1015;

-- ---------------------------------------------------------------------------
-- 1) Re-activate Michael Williams + Piper Finch school day coverage
--    Williams: Mon / Wed / Fri  |  Finch: Tue / Wed / Thu
-- ---------------------------------------------------------------------------
UPDATE provider_school_assignments
SET is_active = TRUE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id = 595
  AND day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday');

UPDATE provider_school_assignments
SET
  slots_total = CASE WHEN day_of_week IN ('Tuesday', 'Thursday') AND COALESCE(slots_total, 0) = 0 THEN 1 ELSE slots_total END,
  slots_available = CASE WHEN day_of_week IN ('Tuesday', 'Thursday') AND COALESCE(slots_total, 0) = 0 THEN 1 ELSE slots_available END,
  updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id = 595
  AND day_of_week IN ('Tuesday', 'Thursday');

UPDATE provider_school_assignments
SET is_active = TRUE, updated_at = NOW()
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id = 596
  AND day_of_week IN ('Tuesday', 'Wednesday', 'Thursday');

INSERT INTO school_day_provider_assignments
  (school_organization_id, provider_user_id, weekday, is_active, created_by_user_id, created_at, updated_at)
VALUES
  (@hogwarts_id, 595, 'Monday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 595, 'Tuesday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 595, 'Wednesday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 595, 'Thursday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 595, 'Friday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 596, 'Tuesday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 596, 'Wednesday', TRUE, @admin_user, NOW(), NOW()),
  (@hogwarts_id, 596, 'Thursday', TRUE, @admin_user, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id, created_at, updated_at)
SELECT @hogwarts_id, 'Wednesday', TRUE, @admin_user, NOW(), NOW()
WHERE @hogwarts_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = TRUE, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2) Fix Michael Williams school clients (were incorrectly on Kingsley Thu)
-- ---------------------------------------------------------------------------
UPDATE clients
SET provider_id = 595, service_day = 'Monday', updated_at = NOW()
WHERE organization_id = @hogwarts_id AND identifier_code = 'MW-SCH-01';

UPDATE clients
SET provider_id = 595, service_day = 'Tuesday', updated_at = NOW()
WHERE organization_id = @hogwarts_id AND identifier_code = 'MW-SCH-02';

UPDATE clients
SET provider_id = 595, service_day = 'Thursday', updated_at = NOW()
WHERE organization_id = @hogwarts_id AND identifier_code = 'MW-SCH-03';

DELETE cpa
FROM client_provider_assignments cpa
JOIN clients c ON c.id = cpa.client_id
WHERE cpa.organization_id = @hogwarts_id
  AND c.identifier_code IN ('MW-SCH-01', 'MW-SCH-02', 'MW-SCH-03');

INSERT INTO client_provider_assignments
  (organization_id, client_id, provider_user_id, service_day, is_primary, is_active, created_at, updated_at)
SELECT c.organization_id, c.id, c.provider_id, c.service_day, TRUE, TRUE, NOW(), NOW()
FROM clients c
WHERE c.organization_id = @hogwarts_id
  AND c.identifier_code IN ('MW-SCH-01', 'MW-SCH-02', 'MW-SCH-03')
  AND c.provider_id IS NOT NULL;

-- Kingsley Thursday soft slots: clear Williams demo clients from slots 4–5
UPDATE soft_schedule_slots s
JOIN clients c ON c.id = s.client_id
SET s.client_id = NULL, s.updated_by_user_id = @admin_user, s.updated_at = NOW()
WHERE s.school_organization_id = @hogwarts_id
  AND s.weekday = 'Thursday'
  AND s.provider_user_id = 1009
  AND c.organization_id = @hogwarts_id
  AND c.identifier_code IN ('MW-SCH-02', 'MW-SCH-03');

-- Williams Monday soft schedule (5 slots, first client assigned)
DELETE FROM soft_schedule_slots
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id = 595;

INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
SELECT @hogwarts_id, 'Monday', 595, 1, '08:00:00', '09:24:00', c.id, 'MW caseload — main office pickup', @admin_user, @admin_user
FROM clients c
WHERE c.organization_id = @hogwarts_id AND c.identifier_code = 'MW-SCH-01'
LIMIT 1;

INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Monday', 595, 2, '09:24:00', '10:48:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Monday', 595, 3, '10:48:00', '12:12:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Monday', 595, 4, '12:12:00', '13:36:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Monday', 595, 5, '13:36:00', '15:00:00', NULL, NULL, @admin_user, @admin_user);

-- Williams Tuesday + Thursday slots for MW-SCH-02 / MW-SCH-03
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
SELECT @hogwarts_id, 'Tuesday', 595, 1, '08:00:00', '15:00:00', c.id, NULL, @admin_user, @admin_user
FROM clients c
WHERE c.organization_id = @hogwarts_id AND c.identifier_code = 'MW-SCH-02'
LIMIT 1;

INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
SELECT @hogwarts_id, 'Thursday', 595, 1, '08:00:00', '15:00:00', c.id, NULL, @admin_user, @admin_user
FROM clients c
WHERE c.organization_id = @hogwarts_id AND c.identifier_code = 'MW-SCH-03'
LIMIT 1;

-- Piper Finch Tuesday soft schedule shell (7 open slots)
DELETE FROM soft_schedule_slots
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id = 596;

INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Tuesday', 596, 1, '08:00:00', '09:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 2, '09:00:00', '10:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 3, '10:00:00', '11:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 4, '11:00:00', '12:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 5, '12:00:00', '13:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 6, '13:00:00', '14:00:00', NULL, NULL, @admin_user, @admin_user),
  (@hogwarts_id, 'Tuesday', 596, 7, '14:00:00', '15:00:00', NULL, NULL, @admin_user, @admin_user);

-- Recompute slots_available after Williams client fixes
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
-- 3) Restore Chuckie Sullivan as Hogwarts school staff (undo demo-only removal)
-- ---------------------------------------------------------------------------
INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT 748, @hogwarts_id, 1
WHERE @hogwarts_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO school_contacts
  (school_organization_id, full_name, email, is_primary, is_school_admin, is_scheduler, created_at, updated_at)
SELECT @hogwarts_id, 'Chuckie Sullivan', 'chuckie@d11.org', 0, 1, 0, NOW(), NOW()
WHERE @hogwarts_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  is_school_admin = VALUES(is_school_admin),
  is_scheduler = VALUES(is_scheduler),
  updated_at = NOW();
