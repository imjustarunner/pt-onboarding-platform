-- Migration 1755: copy portal sign-ins and client opens onto the chart access log.
-- Reads evidence by portal account, not by scanning every audit row.
-- Does not copy email, session, or request details.

INSERT INTO client_access_logs
  (client_id, user_id, user_role, action, route, method, ip_address, user_agent, created_at)
SELECT
  cg.client_id,
  e.user_id,
  LEFT(e.actor_role, 64),
  'portal_sign_in',
  LEFT(e.route, 255),
  LEFT(e.method, 16),
  e.client_ip,
  LEFT(e.user_agent, 255),
  e.occurred_at
FROM users u
STRAIGHT_JOIN security_evidence e
  ON e.user_id = u.id
 AND e.phase = 'completed'
 AND e.action = 'login'
 AND e.outcome = 'succeeded'
JOIN client_guardians cg ON cg.guardian_user_id = u.id AND cg.access_enabled = 1
JOIN clients c ON c.id = cg.client_id
WHERE u.role IN ('client' COLLATE utf8mb4_unicode_ci, 'client_guardian' COLLATE utf8mb4_unicode_ci)
  AND NOT EXISTS (
    SELECT 1 FROM client_access_logs l
    WHERE l.client_id = cg.client_id
      AND l.user_id = u.id
      AND l.action = 'portal_sign_in'
      AND l.created_at BETWEEN e.occurred_at - INTERVAL 2 SECOND AND e.occurred_at + INTERVAL 2 SECOND
  );

INSERT INTO client_access_logs
  (client_id, user_id, user_role, action, route, method, ip_address, user_agent, created_at)
SELECT
  CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.clientId')) AS UNSIGNED),
  e.user_id,
  LEFT(e.actor_role, 64),
  CASE
    WHEN e.route LIKE '%download%' OR e.action IN ('file_response', 'download_link_issued', 'file_link_prepared') THEN 'portal_document_opened'
    WHEN e.route LIKE '%intake-documents%' OR e.route LIKE '%enrollment-copies%' OR e.route LIKE '%shared-files%' OR e.route LIKE '%program-documents%' THEN 'portal_documents_opened'
    WHEN e.route LIKE '%/messages/%' AND e.method IN ('POST', 'PUT', 'PATCH', 'DELETE') THEN 'portal_message_sent'
    WHEN e.route LIKE '%/messages/%' THEN 'portal_message_opened'
    WHEN e.route LIKE '%/messages' THEN 'portal_messages_opened'
    WHEN e.route LIKE '%/emails/%' AND e.method IN ('POST', 'PUT', 'PATCH', 'DELETE') THEN 'portal_email_sent'
    WHEN e.route LIKE '%/emails/%' THEN 'portal_email_opened'
    WHEN e.route LIKE '%/emails' THEN 'portal_emails_opened'
    WHEN e.route LIKE '%appointments%' THEN 'portal_appointments_opened'
    WHEN e.route LIKE '%balances%' THEN 'portal_balances_opened'
    WHEN e.method IN ('POST', 'PUT', 'PATCH', 'DELETE') THEN 'portal_record_updated'
    ELSE 'portal_record_opened'
  END,
  LEFT(e.route, 255),
  LEFT(e.method, 16),
  e.client_ip,
  LEFT(e.user_agent, 255),
  e.occurred_at
FROM users u
STRAIGHT_JOIN security_evidence e
  ON e.user_id = u.id
 AND e.phase = 'completed'
 AND e.outcome IN ('succeeded', 'issued', 'response_sent')
 AND e.route LIKE '%/clients/:clientId%'
JOIN clients c ON c.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.clientId')) AS UNSIGNED)
WHERE u.role IN ('client' COLLATE utf8mb4_unicode_ci, 'client_guardian' COLLATE utf8mb4_unicode_ci)
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.clientId')) AS UNSIGNED) > 0;

INSERT INTO client_access_logs
  (client_id, user_id, user_role, action, route, method, ip_address, user_agent, created_at)
SELECT
  CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.id')) AS UNSIGNED),
  e.user_id,
  LEFT(e.actor_role, 64),
  CASE
    WHEN e.method IN ('POST', 'PUT', 'PATCH', 'DELETE') THEN 'portal_record_updated'
    ELSE 'portal_record_opened'
  END,
  LEFT(e.route, 255),
  LEFT(e.method, 16),
  e.client_ip,
  LEFT(e.user_agent, 255),
  e.occurred_at
FROM users u
STRAIGHT_JOIN security_evidence e
  ON e.user_id = u.id
 AND e.phase = 'completed'
 AND e.outcome IN ('succeeded', 'issued', 'response_sent')
 AND e.route LIKE '/api/clients/:id%'
JOIN clients c ON c.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.id')) AS UNSIGNED)
WHERE u.role IN ('client' COLLATE utf8mb4_unicode_ci, 'client_guardian' COLLATE utf8mb4_unicode_ci)
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.id')) AS UNSIGNED) > 0;
