-- Migration 941: Track which Vonage Application owns the counseling video session
-- Prevents OT_AUTHENTICATION_ERROR when local/stage/prod Application IDs differ
-- but reuse the same counseling_sessions.vonage_session_id.
ALTER TABLE counseling_sessions
  ADD COLUMN vonage_application_id CHAR(36) NULL DEFAULT NULL
    COMMENT 'VONAGE_APPLICATION_ID used when vonage_session_id was created';
