-- Migration 1387: atomic claim for undo/scheduled outbound email sends
-- Prevents duplicate Gmail deliveries when multiple workers flush the same row.
ALTER TABLE communication_messages
  MODIFY COLUMN send_status ENUM('sent', 'scheduled', 'sending', 'cancelled', 'failed')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL
    DEFAULT 'sent'
    COMMENT 'Outbound delivery state; sending = claimed by a worker';

ALTER TABLE communication_messages
  ADD COLUMN send_claimed_at DATETIME NULL DEFAULT NULL
    COMMENT 'When a worker claimed this scheduled send (sending status)'
    AFTER undo_expires_at;
