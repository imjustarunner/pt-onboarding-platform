ALTER TABLE office_event_checkins ADD COLUMN slot_start_at DATETIME NULL;
UPDATE office_event_checkins c JOIN office_events e ON e.id=c.event_id SET c.slot_start_at=e.start_at WHERE c.slot_start_at IS NULL;
-- Install the replacement before removing the legacy index (also supports its FK).
-- Each operation can resume independently after a partial migration.
SET @checkin_slot_index = IF(
  EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'office_event_checkins' AND index_name = 'uniq_office_checkin_slot'),
  'SELECT 1',
  'ALTER TABLE office_event_checkins ADD UNIQUE KEY uniq_office_checkin_slot(event_id,slot_start_at)'
);
PREPARE checkin_slot_index FROM @checkin_slot_index;
EXECUTE checkin_slot_index;
DEALLOCATE PREPARE checkin_slot_index;
SET @checkin_legacy_index = IF(
  EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'office_event_checkins' AND index_name = 'uniq_office_event_checkins_event'),
  'ALTER TABLE office_event_checkins DROP INDEX uniq_office_event_checkins_event',
  'SELECT 1'
);
PREPARE checkin_legacy_index FROM @checkin_legacy_index;
EXECUTE checkin_legacy_index;
DEALLOCATE PREPARE checkin_legacy_index;
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
