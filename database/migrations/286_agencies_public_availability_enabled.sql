/*
Add explicit feature flag for Public Provider Availability (website feed + appointment requests).

This is separate from the access key:
- public_availability_enabled gates the feature (billing/contract)
- public_availability_access_key authenticates public requests

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE agencies
  ADD COLUMN public_availability_enabled BOOLEAN NOT NULL DEFAULT FALSE;

