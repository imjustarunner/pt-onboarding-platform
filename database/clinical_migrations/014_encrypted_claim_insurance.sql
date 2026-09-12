-- Insurance identifiers are encrypted separately from the clinical claim shell.
-- Existing member_id values are migrated by backfillFamilyBillingEncryption.js.
ALTER TABLE clinical_claims ADD COLUMN insurance_payload JSON NULL;
