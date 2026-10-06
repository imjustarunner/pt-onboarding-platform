-- Recovery/removal must invalidate enrollment challenges already being verified.
ALTER TABLE account_passkey_accounts ADD COLUMN authorization_epoch INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE account_passkey_challenges ADD COLUMN authorization_epoch INT UNSIGNED NOT NULL DEFAULT 1;
