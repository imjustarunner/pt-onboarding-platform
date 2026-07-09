-- Migration 900: repair open-ended weekly office assignments
-- Clears temporary_until / occurrence caps left by the old "weekly × 6" intake
-- approval path so AVAILABLE weekly/biweekly standing rows keep materializing.
-- Does NOT touch true TEMPORARY / one-time windows.

-- Standing: open-ended AVAILABLE weekly/biweekly
UPDATE office_standing_assignments
SET temporary_until_date = NULL,
    availability_mode = 'AVAILABLE',
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = TRUE
  AND UPPER(COALESCE(assigned_frequency, 'WEEKLY')) IN ('WEEKLY', 'BIWEEKLY')
  AND UPPER(COALESCE(availability_mode, 'AVAILABLE')) <> 'TEMPORARY'
  AND (
    temporary_until_date IS NOT NULL
    OR UPPER(COALESCE(availability_mode, '')) <> 'AVAILABLE'
  );

-- Booking plans: open-ended weekly on those standing rows
UPDATE office_booking_plans bp
JOIN office_standing_assignments sa ON sa.id = bp.standing_assignment_id
SET bp.active_until_date = NULL,
    bp.booked_occurrence_count = NULL,
    bp.updated_at = CURRENT_TIMESTAMP
WHERE bp.is_active = TRUE
  AND sa.is_active = TRUE
  AND UPPER(COALESCE(sa.assigned_frequency, 'WEEKLY')) IN ('WEEKLY', 'BIWEEKLY')
  AND UPPER(COALESCE(sa.availability_mode, 'AVAILABLE')) <> 'TEMPORARY'
  AND UPPER(COALESCE(bp.booked_frequency, 'WEEKLY')) = 'WEEKLY'
  AND (
    bp.active_until_date IS NOT NULL
    OR bp.booked_occurrence_count IS NOT NULL
  );
