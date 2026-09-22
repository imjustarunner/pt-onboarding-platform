CREATE TABLE supervision_email_deliveries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 session_id INT NOT NULL, user_id INT NOT NULL, delivery_kind VARCHAR(32) NOT NULL,
 start_at DATETIME NOT NULL, delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
 internet_message_id VARCHAR(255) NULL, gmail_thread_id VARCHAR(128) NULL,
 communication_id INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_supervision_email (session_id,user_id,delivery_kind,start_at),
 KEY ix_supervision_email_reply (internet_message_id), KEY ix_supervision_email_thread (gmail_thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE supervision_reply_forwards (
 message_id BIGINT NOT NULL, host_user_id INT NOT NULL, session_id INT NOT NULL, participant_user_id INT NOT NULL,
 conversation_id BIGINT NOT NULL, received_at DATETIME NOT NULL, interpreted_rsvp VARCHAR(16) NULL,
 delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending', communication_id INT NULL,
 PRIMARY KEY (message_id,host_user_id), KEY ix_supervision_reply_due (delivery_status,received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Repair personal inbox Reply-To values created with the shared messages address.
UPDATE email_sender_identities SET reply_to=from_email
 WHERE identity_key REGEXP '^personal_[0-9]+$'
   AND LOWER(SUBSTRING_INDEX(COALESCE(reply_to,''),'@',1))='messages';
