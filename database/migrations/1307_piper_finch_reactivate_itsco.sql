-- Migration 1307: Reactivate ITSCO for Piper Finch and clear demo flag
-- She was moved to Demo Playground with ITSCO deactivated (1230) and marked is_demo (1235).
-- Assigning ITSCO again failed to show because inactive memberships are hidden and
-- agency-list caching could stale; this restores the intended production membership.

UPDATE users u
SET u.is_demo = 0
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) = 'piper finch';

UPDATE user_agencies ua
INNER JOIN users u ON u.id = ua.user_id
INNER JOIN agencies a ON a.id = ua.agency_id
SET ua.is_active = 1
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) = 'piper finch'
  AND (
    LOWER(COALESCE(a.slug, '')) = 'itsco'
    OR LOWER(COALESCE(a.portal_url, '')) = 'itsco'
    OR LOWER(COALESCE(a.name, '')) = 'itsco'
  );
