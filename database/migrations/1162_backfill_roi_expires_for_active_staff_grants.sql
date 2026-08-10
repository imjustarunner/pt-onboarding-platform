-- Migration 1162: Backfill roi_expires_at when staff have active ROI grants but client date is null.
-- Without a date, isRoiExpired(null) treats access as expired even though grants are active.
UPDATE clients c
JOIN (
  SELECT a.client_id, MIN(a.granted_at) AS first_granted_at
  FROM client_school_staff_roi_access a
  WHERE a.is_active = 1
    AND LOWER(COALESCE(a.access_level, '')) IN ('roi', 'roi_docs')
  GROUP BY a.client_id
) g ON g.client_id = c.id
SET c.roi_expires_at = DATE_ADD(DATE(COALESCE(g.first_granted_at, c.created_at, CURRENT_DATE)), INTERVAL 3 YEAR)
WHERE c.roi_expires_at IS NULL;
