-- Private visitor-to-office-owner messages, independent of shared session chat.
CREATE TABLE IF NOT EXISTS private_virtual_office_messages (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 room_id INT NOT NULL,
 visit_id BIGINT NOT NULL,
 author_role ENUM('provider','guest') NOT NULL,
 nonce VARCHAR(80) NOT NULL,
 body_envelope TEXT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 read_at DATETIME(3) NULL,
 UNIQUE KEY office_message_retry (visit_id,author_role,nonce),
 INDEX office_message_thread (room_id,visit_id,id),
 INDEX office_message_unread (room_id,visit_id,author_role,read_at)
);
CREATE TABLE IF NOT EXISTS private_virtual_office_appointment_visits (
 visit_id BIGINT NOT NULL PRIMARY KEY,
 client_id INT NOT NULL,
 guardian_user_id INT NOT NULL,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 appointment_source ENUM('appointment','learning_session') NOT NULL,
 appointment_id INT NOT NULL,
 INDEX office_appointment_visitor (guardian_user_id,client_id,appointment_source,appointment_id)
);
-- Presence in the office page is separate from the monitored video connection
-- used to authorize admission.
ALTER TABLE private_virtual_office_sessions ADD COLUMN office_seen_at DATETIME NULL;
