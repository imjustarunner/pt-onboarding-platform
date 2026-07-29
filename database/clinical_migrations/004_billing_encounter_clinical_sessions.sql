-- Migration 004: Clinical sessions without a calendar event (billing-import encounters)

ALTER TABLE clinical_sessions
  MODIFY COLUMN office_event_id INT NULL
    COMMENT 'NULL when session is backed by billing_encounters only';

ALTER TABLE clinical_sessions
  ADD COLUMN billing_encounter_id BIGINT NULL
    COMMENT 'Main-DB billing_encounters.id when no office_event',
  ADD UNIQUE KEY uniq_clinical_session_billing_encounter (billing_encounter_id);
