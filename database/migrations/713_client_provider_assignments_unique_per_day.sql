-- Allow the same client + provider + school to have multiple weekday rows (e.g. Mon + Wed).
-- Replaces single-row unique (client_id, organization_id, provider_user_id).

ALTER TABLE client_provider_assignments
  DROP INDEX uniq_client_org_provider;

ALTER TABLE client_provider_assignments
  ADD UNIQUE KEY uniq_client_org_provider_day (client_id, organization_id, provider_user_id, service_day);
