-- Support tickets: allow external-origin requests without a users-table actor.
-- Adds a source key so public forms can identify origin (e.g., forgot_username).
--
-- NOTE:
-- Avoid PREPARE/EXECUTE in this migration because some runners use
-- prepared-statement protocol and reject SQL-level PREPARE commands.

ALTER TABLE support_tickets
  ADD COLUMN created_by_source_key VARCHAR(64) NULL AFTER created_by_user_id;

ALTER TABLE support_tickets
  MODIFY COLUMN created_by_user_id INT NULL;

CREATE INDEX idx_support_tickets_created_by_source_key
  ON support_tickets(created_by_source_key);

