-- Per-user games entitlement (billing is user-based, not tenant-based).
ALTER TABLE users
  ADD COLUMN has_games_access TINYINT(1) NOT NULL DEFAULT 0 AFTER has_medical_records_release_access;

CREATE INDEX idx_users_has_games_access ON users(has_games_access);
