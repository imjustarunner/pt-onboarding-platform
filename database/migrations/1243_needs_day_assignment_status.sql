-- Migration 1243: Needs Day Assignment status (provider assigned, no weekday).
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id,
       'needs_day_assignment',
       'Needs Day Assignment',
       'Provider is assigned but the client has no service day. Agency or provider can assign a day.',
       TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  is_active = TRUE;
