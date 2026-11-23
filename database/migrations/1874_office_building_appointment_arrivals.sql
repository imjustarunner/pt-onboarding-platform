ALTER TABLE office_event_checkins
  DROP FOREIGN KEY fk_office_event_checkins_event,
  DROP FOREIGN KEY fk_office_event_checkins_room,
  MODIFY event_id INT NULL,
  MODIFY room_id INT NULL,
  ADD CONSTRAINT fk_office_checkin_linked_event FOREIGN KEY (event_id) REFERENCES office_events(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_office_checkin_linked_room FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  ADD COLUMN appointment_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_office_checkin_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  ADD UNIQUE KEY uniq_office_appointment_arrival (appointment_id, slot_start_at);
