-- 846_conflict_report.sql
-- Run this in TablePlus, MySQL Workbench, or any DB client AFTER running
-- npm run migrate (migration 846).
--
-- Query 1: How many bookings were successfully restored?
SELECT
  COUNT(DISTINCT oe.standing_assignment_id) AS assignments_restored,
  COUNT(oe.id)                              AS events_restored
FROM office_events oe
JOIN office_booking_plans bp ON bp.id = oe.booking_plan_id AND bp.is_active = TRUE
WHERE oe.slot_state = 'ASSIGNED_BOOKED'
  AND oe.status     = 'BOOKED'
  AND oe.start_at  >= NOW()
  AND oe.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY);

-- ─────────────────────────────────────────────────────────────────────────────

-- Query 2: Which slots were SKIPPED because another provider is in the same
-- room + time?  These still need manual resolution.
-- For each conflict: who was originally there, who is currently in the slot,
-- and when the slot is.
SELECT
  oe_released.room_id,
  r.label                                   AS room_label,
  ol.name                                   AS office_name,
  oe_released.start_at,
  oe_released.end_at,
  oe_released.assigned_provider_id          AS original_provider_id,
  CONCAT(u_orig.first_name, ' ', u_orig.last_name) AS original_provider_name,
  oe_conflict.assigned_provider_id          AS current_provider_id,
  CONCAT(u_curr.first_name, ' ', u_curr.last_name) AS current_provider_name,
  oe_conflict.slot_state                    AS current_slot_state,
  oe_released.id                            AS released_event_id,
  oe_conflict.id                            AS conflict_event_id
FROM office_events oe_released
JOIN office_standing_assignments osa
  ON osa.id = oe_released.standing_assignment_id AND osa.is_active = TRUE
JOIN office_rooms r   ON r.id  = oe_released.room_id
JOIN office_locations ol ON ol.id = oe_released.office_location_id
LEFT JOIN users u_orig ON u_orig.id = oe_released.assigned_provider_id
JOIN office_events oe_conflict
  ON oe_conflict.room_id   = oe_released.room_id
  AND oe_conflict.start_at = oe_released.start_at
  AND oe_conflict.end_at   = oe_released.end_at
  AND oe_conflict.id      <> oe_released.id
  AND oe_conflict.slot_state IN ('ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE')
  AND (oe_conflict.status IS NULL OR UPPER(oe_conflict.status) NOT IN ('CANCELLED', 'RELEASED'))
LEFT JOIN users u_curr ON u_curr.id = oe_conflict.assigned_provider_id
WHERE oe_released.slot_state      = 'ASSIGNED_AVAILABLE'
  AND oe_released.status          = 'RELEASED'
  AND oe_released.booking_plan_id IS NULL
  AND oe_released.start_at       >= NOW()
  AND oe_released.updated_at     >= DATE_SUB(NOW(), INTERVAL 60 DAY)
ORDER BY oe_released.start_at, oe_released.room_id;

-- ─────────────────────────────────────────────────────────────────────────────

-- Query 3: Which providers still have no active booking plan but a released
-- future event — meaning the migration skipped them and they need attention?
SELECT
  osa.id                                    AS assignment_id,
  osa.provider_id,
  CONCAT(u.first_name, ' ', u.last_name)    AS provider_name,
  ol.name                                   AS office_name,
  r.label                                   AS room_label,
  CASE osa.weekday
    WHEN 0 THEN 'Sunday'  WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
    WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday'
    WHEN 5 THEN 'Friday'  WHEN 6 THEN 'Saturday'
  END                                       AS weekday,
  osa.hour,
  COUNT(oe.id)                              AS skipped_future_slots
FROM office_standing_assignments osa
JOIN office_locations ol ON ol.id = osa.office_location_id
JOIN office_rooms r       ON r.id  = osa.room_id
JOIN users u              ON u.id  = osa.provider_id
JOIN office_events oe
  ON oe.standing_assignment_id = osa.id
  AND oe.slot_state      = 'ASSIGNED_AVAILABLE'
  AND oe.status          = 'RELEASED'
  AND oe.booking_plan_id IS NULL
  AND oe.start_at       >= NOW()
  AND oe.updated_at     >= DATE_SUB(NOW(), INTERVAL 60 DAY)
LEFT JOIN office_booking_plans active_bp
  ON active_bp.standing_assignment_id = osa.id AND active_bp.is_active = TRUE
WHERE osa.is_active  = TRUE
  AND active_bp.id  IS NULL
GROUP BY osa.id, osa.provider_id, u.first_name, u.last_name,
         ol.name, r.label, osa.weekday, osa.hour
ORDER BY provider_name, oe.start_at;
