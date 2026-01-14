-- Migration: Add API integration fields to user_communications table
-- Description: Add fields to support email and SMS API integration with delivery tracking

ALTER TABLE user_communications
ADD COLUMN channel ENUM('email', 'sms') DEFAULT 'email' COMMENT 'Communication channel: email or SMS' AFTER template_id,
ADD COLUMN recipient_address VARCHAR(255) NULL COMMENT 'Recipient email address or phone number' AFTER body,
ADD COLUMN delivery_status ENUM('pending', 'sent', 'delivered', 'failed', 'bounced', 'undelivered') DEFAULT 'pending' COMMENT 'Delivery status from API' AFTER recipient_address,
ADD COLUMN external_message_id VARCHAR(255) NULL COMMENT 'Message ID from external API (email provider or SMS provider)' AFTER delivery_status,
ADD COLUMN sent_at TIMESTAMP NULL COMMENT 'Timestamp when message was actually sent via API' AFTER external_message_id,
ADD COLUMN delivered_at TIMESTAMP NULL COMMENT 'Timestamp when delivery was confirmed by API' AFTER sent_at,
ADD COLUMN error_message TEXT NULL COMMENT 'Error message if delivery failed' AFTER delivered_at,
ADD COLUMN metadata JSON NULL COMMENT 'Additional metadata from API (webhook data, etc.)' AFTER error_message;

-- Add indexes for efficient querying
CREATE INDEX idx_channel ON user_communications(channel);
CREATE INDEX idx_delivery_status ON user_communications(delivery_status);
CREATE INDEX idx_sent_at ON user_communications(sent_at);
CREATE INDEX idx_external_message_id ON user_communications(external_message_id);

-- Update subject field to be nullable (SMS doesn't have subjects)
ALTER TABLE user_communications
MODIFY COLUMN subject VARCHAR(500) NULL COMMENT 'Email subject (NULL for SMS)';
