-- Identity linkage only: no full-suite credentials, roles or memberships are provisioned.
ALTER TABLE auricwell_accounts
  ADD COLUMN canonical_user_id INT NULL,
  ADD CONSTRAINT fk_aw_account_user FOREIGN KEY (canonical_user_id) REFERENCES users(id),
  ADD UNIQUE KEY aw_account_user (canonical_user_id);
