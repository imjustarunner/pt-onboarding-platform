-- Retain the verified sign-in context across the scoped device grant. This is
-- server-owned provenance, not a bearer token, password or client-supplied proof.
ALTER TABLE mobile_authorization_codes ADD COLUMN primary_authentication_json JSON NULL;
ALTER TABLE mobile_device_sessions ADD COLUMN primary_authentication_json JSON NULL;
