-- Event-named group conversations retain the complete event title (up to 255 characters).
-- Existing channel/group names and frontend channel validation are preserved.
ALTER TABLE chat_threads MODIFY COLUMN name VARCHAR(255) NULL;
