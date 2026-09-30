-- School onboarding links remain valid until explicitly revoked.
ALTER TABLE school_onboarding_invites
  MODIFY COLUMN expires_at DATETIME NULL DEFAULT NULL;

-- Preserve the original token and all saved progress, including for old links.
-- Do not reactivate revoked invites or change completed invites.
UPDATE school_onboarding_invites
SET expires_at = NULL,
    status = CASE
      WHEN status = 'expired' AND submitted_at IS NOT NULL THEN 'submitted'
      WHEN status = 'expired' AND (recipient_started_at IS NOT NULL OR password_set_at IS NOT NULL) THEN 'in_progress'
      WHEN status = 'expired' THEN 'invited'
      ELSE status
    END,
    updated_at = updated_at
WHERE expires_at IS NOT NULL OR status = 'expired';
