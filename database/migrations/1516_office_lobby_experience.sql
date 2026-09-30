ALTER TABLE office_event_checkins ADD COLUMN slot_start_at DATETIME NULL;
UPDATE office_event_checkins c JOIN office_events e ON e.id=c.event_id SET c.slot_start_at=e.start_at WHERE c.slot_start_at IS NULL;
ALTER TABLE office_event_checkins DROP INDEX uniq_office_event_checkins_event, ADD UNIQUE KEY uniq_office_checkin_slot(event_id,slot_start_at);
CREATE TABLE IF NOT EXISTS office_kiosk_support_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) NOT NULL UNIQUE,
 office_location_id INT NOT NULL,
 agency_id INT NOT NULL,
 provider_id INT NOT NULL,
 ticket_id INT NOT NULL,
 sender_address VARCHAR(255) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX office_support_provider(provider_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS office_kiosk_support_recipients (
 request_id BIGINT UNSIGNED NOT NULL,
 user_id INT NOT NULL,
 PRIMARY KEY(request_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
