-- Migration 1085: Seed Hogwarts demo soft schedule slots for sales portal demos.
-- Populates soft_schedule_slots so day panels and provider profiles show realistic schedules.

SET @hogwarts_id := (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

SET @demo_admin := 1015;

DELETE FROM soft_schedule_slots
WHERE school_organization_id = @hogwarts_id
  AND provider_user_id IN (1007, 1008, 1009, 1010);

-- Monday — Sirius Black (6 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Monday', 1007, 1, '08:00:00', '09:10:00', 1181, 'Room 12 / pick up at main office', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1007, 2, '09:10:00', '10:20:00', 1332, 'Co-teach with classroom aide', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1007, 3, '10:20:00', '11:30:00', 1425, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1007, 4, '11:30:00', '12:40:00', 1671, 'Parent prefers before lunch', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1007, 5, '12:40:00', '13:50:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1007, 6, '13:50:00', '15:00:00', NULL, NULL, @demo_admin, @demo_admin);

-- Monday — Nymphadora Tonks (7 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Monday', 1008, 1, '08:00:00', '09:00:00', 1326, 'IEP consult — bring goal sheet', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 2, '09:00:00', '10:00:00', 1349, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 3, '10:00:00', '11:00:00', NULL, 'Open — push-in available', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 4, '11:00:00', '12:00:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 5, '12:00:00', '13:00:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 6, '13:00:00', '14:00:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Monday', 1008, 7, '14:00:00', '15:00:00', NULL, NULL, @demo_admin, @demo_admin);

-- Tuesday — Alastor Moody (5 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Tuesday', 1010, 1, '08:00:00', '09:24:00', 1327, 'Sensory break before session', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Tuesday', 1010, 2, '09:24:00', '10:48:00', 1328, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Tuesday', 1010, 3, '10:48:00', '12:12:00', 1424, 'Room 8 — quiet hallway', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Tuesday', 1010, 4, '12:12:00', '13:36:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Tuesday', 1010, 5, '13:36:00', '15:00:00', NULL, NULL, @demo_admin, @demo_admin);

-- Thursday — Kingsley Shacklebolt (6 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Thursday', 1009, 1, '08:00:00', '09:10:00', 1331, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Thursday', 1009, 2, '09:10:00', '10:20:00', 1333, 'Group table near library', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Thursday', 1009, 3, '10:20:00', '11:30:00', 1350, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Thursday', 1009, 4, '11:30:00', '12:40:00', 1672, 'Notify nurse before session', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Thursday', 1009, 5, '12:40:00', '13:50:00', 1673, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Thursday', 1009, 6, '13:50:00', '15:00:00', NULL, 'Open slot', @demo_admin, @demo_admin);

-- Friday — Sirius Black half day (4 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Friday', 1007, 1, '08:00:00', '09:00:00', NULL, 'Half day — morning only', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1007, 2, '09:00:00', '10:00:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1007, 3, '10:00:00', '11:00:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1007, 4, '11:00:00', '12:00:00', NULL, NULL, @demo_admin, @demo_admin);

-- Friday — Nymphadora Tonks (5 slots)
INSERT INTO soft_schedule_slots
  (school_organization_id, weekday, provider_user_id, slot_index, start_time, end_time, client_id, note, created_by_user_id, updated_by_user_id)
VALUES
  (@hogwarts_id, 'Friday', 1008, 1, '08:00:00', '09:24:00', 1334, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1008, 2, '09:24:00', '10:48:00', 1348, 'End-of-week check-in', @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1008, 3, '10:48:00', '12:12:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1008, 4, '12:12:00', '13:36:00', NULL, NULL, @demo_admin, @demo_admin),
  (@hogwarts_id, 'Friday', 1008, 5, '13:36:00', '15:00:00', NULL, NULL, @demo_admin, @demo_admin);
