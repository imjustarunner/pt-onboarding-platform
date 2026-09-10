-- Migration 1410: Reactivate ITSCO membership for williams@itsco.health
-- so Note Aid work-queue / client create can post to ITSCO (was is_active=0).

UPDATE user_agencies ua
INNER JOIN users u ON u.id = ua.user_id
SET ua.is_active = 1
WHERE LOWER(TRIM(u.email)) = 'williams@itsco.health'
  AND ua.agency_id = 2
  AND (ua.is_active = 0 OR ua.is_active IS NULL OR ua.is_active = FALSE);
