-- Migration: Add provider accepting-new-clients flag
-- Description: Allows providers (and admins) to mark whether they are open for new clients.

ALTER TABLE users
  ADD COLUMN provider_accepting_new_clients BOOLEAN NOT NULL DEFAULT TRUE AFTER has_staff_access;

