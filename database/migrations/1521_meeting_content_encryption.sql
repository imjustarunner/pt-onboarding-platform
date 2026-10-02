-- Require application encryption for meeting content. Separate ALTERs permit retry.
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN sensitive_ciphertext LONGTEXT NULL;
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN sensitive_iv VARCHAR(64) NULL;
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN sensitive_auth_tag VARCHAR(64) NULL;
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN encryption_key_id VARCHAR(64) NULL;
-- Agenda text stores authenticated encryption envelopes, including expansion overhead.
ALTER TABLE meeting_agenda_items MODIFY COLUMN title MEDIUMTEXT NOT NULL;
ALTER TABLE meeting_agenda_items MODIFY COLUMN notes MEDIUMTEXT NULL;
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN transcript_revision INT NOT NULL DEFAULT 0;
