-- Public registration receipt page (read-only) — token issued on intake finalize.

ALTER TABLE intake_submissions
  ADD COLUMN registration_receipt_token VARCHAR(96) NULL DEFAULT NULL
    COMMENT 'Opaque token for /registration-receipt without login' AFTER session_token,
  ADD INDEX idx_intake_submissions_registration_receipt_token (registration_receipt_token);
