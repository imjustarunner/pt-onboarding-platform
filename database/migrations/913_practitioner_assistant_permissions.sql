-- Migration 913: practitioner assistant permissions on user_agencies
-- Phase 7: scoped capabilities for staff assistants on life_coach / consultant tenants.

ALTER TABLE user_agencies
  ADD COLUMN practitioner_assistant_permissions_json JSON NULL
  COMMENT 'Scoped capabilities for practitioner staff assistants (clients, inquiries, calendar, discovery, packets, messages)';
