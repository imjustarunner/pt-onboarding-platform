-- Migration 1334: Track invite email send + recipient start; fix view-only in_progress rows

ALTER TABLE school_onboarding_invites
  ADD COLUMN invite_email_sent_at DATETIME NULL DEFAULT NULL
    COMMENT 'When the onboarding invite email was last sent to the contact',
  ADD COLUMN recipient_started_at DATETIME NULL DEFAULT NULL
    COMMENT 'When the invitee first saved onboarding progress (not link preview)';

-- Link preview alone should not leave status as in_progress when no steps were saved.
UPDATE school_onboarding_invites
SET status = 'invited'
WHERE status = 'in_progress'
  AND submitted_at IS NULL
  AND password_set_at IS NULL
  AND recipient_started_at IS NULL
  AND (
    step_progress IS NULL
    OR (
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.school_information')), 'not_started') = 'not_started'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.school_staff')), 'not_started') = 'not_started'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.preferred_days')), 'not_started') = 'not_started'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.welcome_materials')), 'not_started') = 'not_started'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.explore_demo')), 'not_started') = 'not_started'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_progress, '$.review_submit')), 'not_started') = 'not_started'
    )
  );
