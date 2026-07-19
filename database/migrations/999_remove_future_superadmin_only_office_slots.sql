-- Migration 999: Remove future office slots that belong only to Super Admin (user id 1).
-- Verified: no client/clinical/appointment links; standing ownership is also user 1 only.
-- Deletes future office_events, then deactivates user-1 booking plans + standing assignments
-- so they cannot rematerialize.

-- Child rows on events (if any)
DELETE c
FROM office_event_checkins c
JOIN office_events e ON e.id = c.event_id
WHERE e.start_at >= CURDATE()
  AND (e.assigned_provider_id IS NULL OR e.assigned_provider_id = 1)
  AND (e.booked_provider_id IS NULL OR e.booked_provider_id = 1)
  AND (
    e.assigned_provider_id = 1
    OR e.booked_provider_id = 1
    OR EXISTS (
      SELECT 1
      FROM office_standing_assignments osa
      WHERE osa.id = e.standing_assignment_id
        AND osa.provider_id = 1
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM office_standing_assignments osa
    WHERE osa.id = e.standing_assignment_id
      AND osa.provider_id IS NOT NULL
      AND osa.provider_id <> 1
  );

DELETE q
FROM office_questionnaire_responses q
JOIN office_events e ON e.id = q.event_id
WHERE e.start_at >= CURDATE()
  AND (e.assigned_provider_id IS NULL OR e.assigned_provider_id = 1)
  AND (e.booked_provider_id IS NULL OR e.booked_provider_id = 1)
  AND (
    e.assigned_provider_id = 1
    OR e.booked_provider_id = 1
    OR EXISTS (
      SELECT 1
      FROM office_standing_assignments osa
      WHERE osa.id = e.standing_assignment_id
        AND osa.provider_id = 1
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM office_standing_assignments osa
    WHERE osa.id = e.standing_assignment_id
      AND osa.provider_id IS NOT NULL
      AND osa.provider_id <> 1
  );

-- Future Super Admin-only occurrences
DELETE e
FROM office_events e
WHERE e.start_at >= CURDATE()
  AND (e.assigned_provider_id IS NULL OR e.assigned_provider_id = 1)
  AND (e.booked_provider_id IS NULL OR e.booked_provider_id = 1)
  AND (
    e.assigned_provider_id = 1
    OR e.booked_provider_id = 1
    OR EXISTS (
      SELECT 1
      FROM office_standing_assignments osa
      WHERE osa.id = e.standing_assignment_id
        AND osa.provider_id = 1
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM office_standing_assignments osa
    WHERE osa.id = e.standing_assignment_id
      AND osa.provider_id IS NOT NULL
      AND osa.provider_id <> 1
  );

-- Stop rematerialization of Super Admin standing inventory
UPDATE office_booking_plans bp
JOIN office_standing_assignments osa ON osa.id = bp.standing_assignment_id
SET bp.is_active = FALSE,
    bp.updated_at = CURRENT_TIMESTAMP
WHERE osa.provider_id = 1
  AND bp.is_active = TRUE;

UPDATE office_standing_assignments
SET is_active = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE provider_id = 1
  AND is_active = TRUE;
