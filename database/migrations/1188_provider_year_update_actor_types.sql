-- Migration 1188: allow magic-link (token_guest) and auto-finalize actors on Provider Year Update audit columns

ALTER TABLE provider_year_update_section_progress
  MODIFY COLUMN reviewed_by_actor_type ENUM('provider', 'admin', 'token_guest', 'auto') NULL DEFAULT NULL;

ALTER TABLE provider_year_update_cycles
  MODIFY COLUMN finalized_by_actor_type ENUM('provider', 'admin', 'token_guest', 'auto') NULL DEFAULT NULL;
