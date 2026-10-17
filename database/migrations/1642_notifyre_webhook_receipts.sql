CREATE TABLE IF NOT EXISTS notifyre_webhook_receipts (
  event_key CHAR(64) NOT NULL PRIMARY KEY,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  INDEX idx_notifyre_received_at (received_at)
);

-- Preserve provider receipts separately from API acceptance; the legacy enum only supported four states.
ALTER TABLE message_logs MODIFY COLUMN delivery_status VARCHAR(32) NULL DEFAULT 'received';
