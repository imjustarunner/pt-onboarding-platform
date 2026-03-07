-- Migration: add sender identity signature image fields
-- Description: allow per-sender, per-agency email signature image blocks (PNG/JPG) for outbound email footers.

ALTER TABLE email_sender_identities
  ADD COLUMN signature_image_url VARCHAR(1000) NULL COMMENT 'Absolute or relative URL to signature image shown in outbound emails' AFTER reply_to,
  ADD COLUMN signature_image_path VARCHAR(500) NULL COMMENT 'Storage key/path for signature image asset (optional metadata)' AFTER signature_image_url,
  ADD COLUMN signature_alt_text VARCHAR(255) NULL COMMENT 'Alt text for signature image' AFTER signature_image_path;

