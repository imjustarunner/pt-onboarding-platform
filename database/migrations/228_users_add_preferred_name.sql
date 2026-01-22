-- Migration: Add preferred_name to users for display-only nicknames

ALTER TABLE users
  ADD COLUMN preferred_name VARCHAR(255) NULL AFTER first_name;

