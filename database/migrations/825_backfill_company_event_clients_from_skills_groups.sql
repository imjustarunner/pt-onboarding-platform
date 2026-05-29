-- Migration 825: mirror skills_group_clients into company_event_clients
-- Skill Builders enrollments historically only wrote skills_group_clients;
-- the event portal Participants workflow reads company_event_clients.

INSERT INTO company_event_clients (company_event_id, agency_id, client_id, is_active)
SELECT sg.company_event_id, sg.agency_id, sgc.client_id, TRUE
FROM skills_group_clients sgc
INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
LEFT JOIN company_event_clients cec
  ON cec.company_event_id = sg.company_event_id
 AND cec.client_id = sgc.client_id
WHERE cec.id IS NULL
  AND sg.company_event_id IS NOT NULL
  AND sg.agency_id IS NOT NULL;
