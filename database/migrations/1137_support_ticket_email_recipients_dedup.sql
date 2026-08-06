-- Migration 1137: add email recipients storage and unique index for deduplication

-- Store the full To/CC recipient list as JSON so we can display all recipients
-- when a group email creates a ticket, instead of showing duplicates.
ALTER TABLE support_tickets
  ADD COLUMN source_email_recipients JSON NULL DEFAULT NULL
    COMMENT 'JSON array of To/CC addresses from the original inbound email';

-- Unique index to prevent duplicate tickets for the same Gmail message-id.
-- source_email_message_id can be NULL for portal tickets, so we use a partial
-- index approach via a filtered unique — MySQL does not support partial indexes,
-- but the migration runner only runs once, so we guard with a NULL check in code.
-- We add a regular unique index; NULLs are never considered equal in MySQL,
-- so two NULL rows are fine (portal tickets). Only email tickets collide.
ALTER TABLE support_tickets
  ADD UNIQUE INDEX uq_source_email_message_id (source_email_message_id);
