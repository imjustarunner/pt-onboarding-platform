-- Migration 911: practitioner packet wizard progress (docs + account)
-- Tracks intake-link completion and portal account creation before packet COMPLETED.

ALTER TABLE practitioner_client_packets
  ADD COLUMN completed_intake_link_ids_json JSON NULL
    COMMENT 'intake_links.id values the client has finished for this packet'
    AFTER intake_link_ids_json,
  ADD COLUMN account_user_id INT NULL
    COMMENT 'client_guardian user created at end of packet wizard'
    AFTER completed_intake_link_ids_json;

