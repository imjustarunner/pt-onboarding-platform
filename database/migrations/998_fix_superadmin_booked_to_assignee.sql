-- Migration 998: Realign office bookings wrongly attributed to a superadmin
-- After assignment loss/reissue, some rows kept booked_provider_id on a superadmin
-- while assigned_provider_id correctly pointed at the standing provider.
-- For those rows, set booked_provider_id = assigned_provider_id (not a day-borrow).

UPDATE office_events e
JOIN users bu ON bu.id = e.booked_provider_id
SET e.booked_provider_id = e.assigned_provider_id,
    e.updated_at = CURRENT_TIMESTAMP
WHERE e.assigned_provider_id IS NOT NULL
  AND e.booked_provider_id IS NOT NULL
  AND e.assigned_provider_id <> e.booked_provider_id
  AND (
    e.booked_provider_id = 1
    OR LOWER(REPLACE(bu.role, '_', '')) = 'superadmin'
  );
