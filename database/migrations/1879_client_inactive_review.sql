-- Keep the legacy workflow flag compatible with roster queries. Inactive is
-- a separate catalog state from a clinically documented termination.
ALTER TABLE clients
  ADD COLUMN termination_note_required BOOLEAN NULL,
  ADD COLUMN termination_note_not_required_reason TEXT NULL;

INSERT INTO client_statuses (agency_id,status_key,label,description,is_active)
SELECT a.id,'inactive','Inactive','Active services ended; record retained.',TRUE FROM agencies a
WHERE NOT EXISTS (SELECT 1 FROM client_statuses s WHERE s.agency_id=a.id AND s.status_key='inactive');

ALTER TABLE client_schedule_termination_jobs ADD COLUMN closure_reason VARCHAR(80) NOT NULL DEFAULT 'Client terminated';

UPDATE client_statuses SET is_active=TRUE WHERE status_key='inactive';
