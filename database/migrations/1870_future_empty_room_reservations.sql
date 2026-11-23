-- Preserve the standing owner and recurrence. Convert only future,
-- automatically materialized room time with no linked session or hold.
UPDATE office_events e
JOIN office_standing_assignments s ON s.id = e.standing_assignment_id
LEFT JOIN appointments a ON a.office_event_id = e.id
LEFT JOIN office_booking_plans plan ON plan.id = e.booking_plan_id
SET e.status = 'RELEASED',
    e.slot_state = 'ASSIGNED_AVAILABLE',
    e.booked_provider_id = NULL,
    e.booking_plan_id = NULL
WHERE e.start_at > UTC_TIMESTAMP()
  AND e.status = 'BOOKED' AND e.slot_state = 'ASSIGNED_BOOKED'
  AND e.source = 'ADMIN_OVERRIDE' AND s.is_active = 1
  AND e.assigned_provider_id = s.provider_id
  AND (e.booked_provider_id IS NULL OR e.booked_provider_id = s.provider_id)
  AND e.client_id IS NULL AND e.clinical_session_id IS NULL
  AND e.note_context_id IS NULL AND e.billing_context_id IS NULL AND e.service_code IS NULL
  AND a.id IS NULL
  AND JSON_EXTRACT(e.session_context_json, '$.appointmentId') IS NULL
  AND JSON_EXTRACT(e.session_context_json, '$.appointmentSeriesId') IS NULL
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(plan.session_context_json, '$.clientId')), '') IN ('', 'null', '0');
