-- Migration: Add hiring access flag to users
-- Description: Allow non-admin helpers (e.g. providers) to access hiring features when explicitly granted.

-- Note: migration runner ignores "already exists" errors
ALTER TABLE users
ADD COLUMN has_hiring_access TINYINT(1) NOT NULL DEFAULT 0 AFTER has_staff_access;

CREATE INDEX idx_users_has_hiring_access ON users(has_hiring_access);

