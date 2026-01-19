-- Migration: Expand client identifier fields to support longer codes
-- Description:
-- - Bulk Client Upload uses a client code like "MesJuv" (can be longer for hyphenated last names).
-- - Existing schema uses initials VARCHAR(10) and identifier_code VARCHAR(6), which can truncate.
-- Safe: MODIFY is idempotent if already at desired size.

ALTER TABLE clients
  MODIFY initials VARCHAR(32) NOT NULL,
  MODIFY identifier_code VARCHAR(32) NULL;

