-- Migration: Provider-school accepting-new-clients override
-- Description: Allows a per-school override for provider availability (open/closed).

ALTER TABLE provider_school_assignments
  ADD COLUMN accepting_new_clients_override BOOLEAN NULL AFTER is_active;

