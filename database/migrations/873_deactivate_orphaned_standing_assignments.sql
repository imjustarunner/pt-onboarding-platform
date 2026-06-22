-- Migration 873: deactivate stale standing assignments and orphaned booking plans
-- Ghost assignments caused false scheduling conflicts when approving provider
-- requests even though the schedule grid showed the slot as open.
--
-- Deactivate when:
--   1) temporary_until_date has passed (materializer will never create rows again), OR
--   2) no active booking plan AND no future live office_events for the assignment

UPDATE office_standing_assignments sa
SET    sa.is_active = 0,
       sa.updated_at = NOW()
WHERE  sa.is_active = 1
  AND  (
         (sa.temporary_until_date IS NOT NULL AND sa.temporary_until_date < CURDATE())
         OR (
           NOT EXISTS (
             SELECT 1
             FROM   office_booking_plans bp
             WHERE  bp.standing_assignment_id = sa.id
               AND  bp.is_active = 1
           )
           AND NOT EXISTS (
             SELECT 1
             FROM   office_events e
             WHERE  e.standing_assignment_id = sa.id
               AND  e.start_at >= CURDATE()
               AND  (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           )
         )
       );

UPDATE office_booking_plans bp
JOIN   office_standing_assignments sa ON sa.id = bp.standing_assignment_id
SET    bp.is_active = 0,
       bp.updated_at = NOW()
WHERE  bp.is_active = 1
  AND  sa.is_active = 0;
