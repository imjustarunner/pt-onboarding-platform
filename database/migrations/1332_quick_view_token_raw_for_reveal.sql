-- Migration 1332: store Quick View URL token for authenticated reveal (hash still used for lookup)
ALTER TABLE user_quick_view_credentials
  ADD COLUMN token_raw VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
  COMMENT 'Raw persistent Quick View URL token; returned only after password/confirm reveal'
  AFTER token_hash;
