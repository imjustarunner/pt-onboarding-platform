-- Migration: Add has_medical_records_release_access to users
-- Description: Only users with this flag can view/download medical records release submissions in Submitted Documents.
-- Admins grant this access explicitly; it is not enabled by default.

ALTER TABLE users
  ADD COLUMN has_medical_records_release_access TINYINT(1) NOT NULL DEFAULT 0 AFTER has_hiring_access;

CREATE INDEX idx_users_has_medical_records_release_access
  ON users(has_medical_records_release_access);
