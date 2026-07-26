-- Migration 1050: Encrypt supervision session artifacts at rest
-- (transcript, AI summary, private notes, goals, action items, focus title).
-- Legacy plaintext columns remain for back-compat; new writes prefer ciphertext.

ALTER TABLE supervision_session_artifacts
  ADD COLUMN sensitive_ciphertext MEDIUMTEXT NULL
    COMMENT 'AES-GCM encrypted JSON of supervision sensitive fields',
  ADD COLUMN sensitive_iv VARCHAR(64) NULL
    COMMENT 'IV for sensitive_ciphertext',
  ADD COLUMN sensitive_auth_tag VARCHAR(64) NULL
    COMMENT 'Auth tag for sensitive_ciphertext',
  ADD COLUMN encryption_key_id VARCHAR(64) NULL
    COMMENT 'Key id used to encrypt sensitive_ciphertext';
