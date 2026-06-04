-- Migration 851: Resolve stale office/school availability request notifications
-- whose underlying requests are no longer PENDING (already ASSIGNED or CANCELLED).
--
-- ROOT CAUSE:
--   When a provider cancels their own pending requests via the "unrequest all"
--   flow, the backend updated the request status to CANCELLED but did not call
--   Notification.markAllAsResolvedForFilter.  This left admin notification feeds
--   showing "35 pending" items that all say "Request not found or already resolved"
--   when clicked, because the request no longer has status=PENDING.
--
-- WHAT THIS DOES:
--   Marks is_resolved = TRUE for every office/school availability request
--   notification whose related request is no longer in PENDING status.

UPDATE notifications n
JOIN provider_office_availability_requests r
  ON  r.id     = n.related_entity_id
  AND n.related_entity_type = 'provider_office_availability_request'
SET n.is_resolved = TRUE,
    n.resolved_at = NOW()
WHERE n.type        = 'office_availability_request_pending'
  AND n.is_resolved = FALSE
  AND r.status     <> 'PENDING';
