/*
Create twilio_composition_pending for composition status callback webhook.

Purpose:
- Store composition_sid -> event_id mapping when creating a composition.
- When Twilio POSTs status=completed to our webhook, we look up event_id, download media, store in GCS, update artifacts.
- Replaces polling with event-driven flow.
*/

CREATE TABLE IF NOT EXISTS twilio_composition_pending (
  id INT AUTO_INCREMENT PRIMARY KEY,
  composition_sid VARCHAR(34) NOT NULL UNIQUE,
  event_id INT NOT NULL,
  room_sid VARCHAR(34) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_composition_sid (composition_sid),
  INDEX idx_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
