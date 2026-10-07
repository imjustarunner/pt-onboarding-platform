-- Private forwarding numbers stay encrypted, outside public branding flags.
CREATE TABLE IF NOT EXISTS agency_phone_workflows (
 agency_id INT NOT NULL PRIMARY KEY,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 config_ciphertext MEDIUMTEXT NOT NULL,
 config_iv VARCHAR(64) NOT NULL,
 config_auth_tag VARCHAR(64) NOT NULL,
 encryption_key_id VARCHAR(100) NULL,
 updated_by INT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
