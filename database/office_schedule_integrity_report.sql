-- Office schedule integrity report
-- Run before migration 862 if the migration reports duplicate-key failures.

-- 1) Active room/time event duplicates.
SELECT
  e.office_location_id,
  ol.name AS office_name,
  e.room_id,
  r.label AS room_label,
  e.start_at,
  e.end_at,
  COUNT(*) AS event_count,
  GROUP_CONCAT(e.id ORDER BY e.id) AS event_ids,
  GROUP_CONCAT(DISTINCT CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) ORDER BY u.last_name SEPARATOR ', ') AS providers
FROM office_events e
JOIN office_locations ol ON ol.id = e.office_location_id
JOIN office_rooms r ON r.id = e.room_id
LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
WHERE (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
GROUP BY e.office_location_id, ol.name, e.room_id, r.label, e.start_at, e.end_at
HAVING COUNT(*) > 1
ORDER BY e.start_at ASC, ol.name ASC, r.label ASC;

-- 2) Active standing assignment duplicates for the same physical slot.
SELECT
  a.office_location_id,
  ol.name AS office_name,
  a.room_id,
  r.label AS room_label,
  a.weekday,
  a.hour,
  COUNT(*) AS assignment_count,
  GROUP_CONCAT(a.id ORDER BY a.id) AS assignment_ids,
  GROUP_CONCAT(DISTINCT CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) ORDER BY u.last_name SEPARATOR ', ') AS providers
FROM office_standing_assignments a
JOIN office_locations ol ON ol.id = a.office_location_id
JOIN office_rooms r ON r.id = a.room_id
LEFT JOIN users u ON u.id = a.provider_id
WHERE a.is_active = TRUE
GROUP BY a.office_location_id, ol.name, a.room_id, r.label, a.weekday, a.hour
HAVING COUNT(*) > 1
ORDER BY ol.name ASC, r.label ASC, a.weekday ASC, a.hour ASC;

-- 3) Providers booked into more than one room at the exact same time.
SELECT
  provider_id,
  provider_name,
  start_at,
  end_at,
  COUNT(*) AS booking_count,
  GROUP_CONCAT(event_id ORDER BY event_id) AS event_ids,
  GROUP_CONCAT(room_label ORDER BY room_label SEPARATOR ', ') AS rooms
FROM (
  SELECT
    e.id AS event_id,
    COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) AS provider_id,
    CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS provider_name,
    e.start_at,
    e.end_at,
    CONCAT(ol.name, ' / ', COALESCE(r.label, r.name)) AS room_label
  FROM office_events e
  JOIN office_locations ol ON ol.id = e.office_location_id
  JOIN office_rooms r ON r.id = e.room_id
  LEFT JOIN office_standing_assignments sa ON sa.id = e.standing_assignment_id
  LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id)
  WHERE (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
    AND UPPER(COALESCE(e.status, '')) = 'BOOKED'
    AND COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) IS NOT NULL
) booked
GROUP BY provider_id, provider_name, start_at, end_at
HAVING COUNT(*) > 1
ORDER BY start_at ASC, provider_name ASC;
