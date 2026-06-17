-- Migration 868: appointment taxonomy — session_type and eval_required on public requests
ALTER TABLE public_appointment_requests
  ADD COLUMN session_type VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'evaluation | tutoring | counseling | consultation — granular type within service_type',
  ADD COLUMN eval_required TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 if client self-reported no recent assessments and an evaluation is required before the session';

-- PENDING_EVAL is a logical status (VARCHAR — no ENUM, so no schema change needed).
-- It means: this session request is paired with an unapproved evaluation appointment
-- and must not be acted on until that evaluation is approved first.

INSERT INTO notification_triggers (trigger_key, name, description)
VALUES ('evaluation_request_approved', 'Evaluation request approved',
  'Sent to client/guardian when their evaluation appointment is approved and their linked tutoring session is now ready for scheduling.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
