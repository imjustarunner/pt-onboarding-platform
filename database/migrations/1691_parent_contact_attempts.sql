CREATE TABLE IF NOT EXISTS client_parent_contact_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  source_type VARCHAR(16) NOT NULL,
  conversation_key VARCHAR(255) NOT NULL,
  first_source_id BIGINT UNSIGNED NOT NULL,
  occurred_at DATETIME NOT NULL,
  UNIQUE KEY uq_parent_contact_conversation (client_id, source_type, conversation_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO client_parent_contact_attempts (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at)
SELECT e.client_id,e.agency_id,'email',CAST(m.conversation_id AS CHAR),MIN(e.source_id),MIN(e.occurred_at)
FROM client_parent_contact_events e JOIN communication_messages m ON m.id=e.source_id
WHERE e.source_type='email' AND e.direction='outbound'
GROUP BY e.client_id,e.agency_id,m.conversation_id;

INSERT IGNORE INTO client_parent_contact_attempts (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at)
SELECT e.client_id,e.agency_id,'secure',CONCAT(m.thread_id,':',COALESCE(m.topic_id,'legacy')),MIN(e.source_id),MIN(e.occurred_at)
FROM client_parent_contact_events e JOIN chat_messages m ON m.id=e.source_id
WHERE e.source_type='secure' AND e.direction='outbound'
GROUP BY e.client_id,e.agency_id,m.thread_id,m.topic_id;

INSERT IGNORE INTO client_parent_contact_attempts (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at)
SELECT e.client_id,e.agency_id,'sms',CONCAT(COALESCE(m.sms_thread_key,CONCAT('message:',m.id)),':legacy'),MIN(e.source_id),MIN(e.occurred_at)
FROM client_parent_contact_events e JOIN message_logs m ON m.id=e.source_id
WHERE e.source_type='sms' AND e.direction='outbound'
GROUP BY e.client_id,e.agency_id,CONCAT(COALESCE(m.sms_thread_key,CONCAT('message:',m.id)),':legacy');
