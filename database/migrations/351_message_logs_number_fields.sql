-- Migration: Add number routing fields to message_logs
-- Description: Tracks which Twilio number and assignment handled the message.

ALTER TABLE message_logs
ADD COLUMN number_id INT NULL AFTER agency_id,
ADD COLUMN assigned_user_id INT NULL AFTER user_id,
ADD COLUMN owner_type ENUM('staff','agency') NULL AFTER assigned_user_id,
ADD INDEX idx_message_number (number_id),
ADD INDEX idx_message_assigned_user (assigned_user_id),
ADD CONSTRAINT fk_message_number_id FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_message_assigned_user_id FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
