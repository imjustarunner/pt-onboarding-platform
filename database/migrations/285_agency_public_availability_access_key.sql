/*
Add agency-level public availability access key.

This key is used to authenticate requests to public provider availability endpoints.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE agencies
  ADD COLUMN public_availability_access_key VARCHAR(128) NULL;

CREATE INDEX idx_agencies_public_availability_access_key
  ON agencies (public_availability_access_key);

