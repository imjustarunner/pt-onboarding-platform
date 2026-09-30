-- Persist the sender's explicit choice through queue processing and inbound app delivery.
CREATE TABLE IF NOT EXISTS communication_message_delivery_choices (
  message_id INT NOT NULL PRIMARY KEY,
  actor_user_id INT NOT NULL,
  delivery_choice ENUM('now', 'next_available') NOT NULL,
  recipient_user_ids JSON NOT NULL,
  scheduled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_message_delivery_choice_message FOREIGN KEY (message_id)
    REFERENCES communication_messages(id) ON DELETE CASCADE
);
