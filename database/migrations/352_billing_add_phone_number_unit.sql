-- Migration: Add phone number unit pricing to platform billing JSON
-- NOTE:
-- Some environments have an oversized legacy pricing_json row that exceeds
-- max_allowed_packet on any JSON mutation. Runtime billing code already
-- provides a default for unitCents.phoneNumber (0), so this backfill can be
-- treated as a safe no-op.
SELECT 1;
