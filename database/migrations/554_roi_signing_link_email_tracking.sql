-- Track how many times an ROI email was sent per signing link.

ALTER TABLE client_school_roi_signing_links
  ADD COLUMN email_send_count INT NOT NULL DEFAULT 0 AFTER access_applied_at,
  ADD COLUMN last_email_sent_at DATETIME NULL AFTER email_send_count,
  ADD COLUMN last_email_sent_to VARCHAR(320) NULL AFTER last_email_sent_at;
