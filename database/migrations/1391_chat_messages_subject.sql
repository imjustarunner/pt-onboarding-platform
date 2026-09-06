-- Migration 1391: optional subject on chat messages for Hub secure threads
ALTER TABLE chat_messages
  ADD COLUMN subject VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'Hub secure conversation subject; internal/SMS stay thread-style'
    AFTER body;
