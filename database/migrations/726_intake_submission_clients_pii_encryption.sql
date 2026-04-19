-- Migration: Encrypt PII on intake_submission_clients (per-child intake row).
--
-- intake_submission_clients holds the child's full_name and contact_phone for
-- every intake submission (including multi-child packets). These mirror the
-- intake_submissions sensitive fields encrypted in 725 — the same intake
-- delivers them, so they should be protected the same way.
--
-- The encrypted blob contains JSON: { fullName, contactPhone }
-- "initials" is short, non-identifying, and used for display joins, so it
-- stays in plaintext.

ALTER TABLE intake_submission_clients
  ADD COLUMN pii_encrypted BLOB NULL AFTER initials,
  ADD COLUMN pii_iv_b64 VARCHAR(64) NULL AFTER pii_encrypted,
  ADD COLUMN pii_auth_tag_b64 VARCHAR(64) NULL AFTER pii_iv_b64,
  ADD COLUMN pii_key_id VARCHAR(50) NULL AFTER pii_auth_tag_b64;
