-- Service participation is independent of login permissions and new-client availability.
ALTER TABLE users ADD COLUMN sees_clients TINYINT(1) NOT NULL DEFAULT 1;
-- Explicit exceptions requested by the organization; restrict to the confirmed ITSCO accounts.
UPDATE users SET sees_clients=0 WHERE id=506 AND first_name='Pauline' AND last_name='Boyd';
UPDATE users SET sees_clients=1, provider_accepting_new_clients=0 WHERE id=525 AND first_name='Randy' AND last_name='Menegatti';
