-- Add room_id to office availability request slots so requests can target a specific room.
-- NULL = any room at the office (existing behavior).
ALTER TABLE provider_office_availability_request_slots
  ADD COLUMN room_id INT NULL AFTER end_hour,
  ADD KEY idx_provider_office_availability_request_slots_room (room_id);
