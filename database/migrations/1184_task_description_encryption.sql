-- Migration 1184: optional encrypted task descriptions (clinical intake review PHI)
ALTER TABLE tasks
  ADD COLUMN description_ciphertext LONGTEXT NULL
    COMMENT 'AES-256-GCM encrypted task description (plaintext column holds placeholder)',
  ADD COLUMN description_iv VARCHAR(64) NULL,
  ADD COLUMN description_auth_tag VARCHAR(64) NULL,
  ADD COLUMN description_encryption_key_id VARCHAR(64) NULL;
