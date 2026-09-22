CREATE TABLE huddle_email_deliveries LIKE supervision_email_deliveries;
ALTER TABLE supervision_reply_forwards ADD COLUMN meeting_type VARCHAR(24) NOT NULL DEFAULT 'supervision';
CREATE TABLE priority_event_inbox_copies (
 message_id VARCHAR(128) NOT NULL PRIMARY KEY, payload_json JSON NOT NULL,
 completed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE inbound_event_email_deliveries (
 inbox_id BIGINT NOT NULL, message_id BIGINT NOT NULL, delivery_status VARCHAR(24) NOT NULL DEFAULT 'sending',
 communication_id INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(inbox_id,message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
