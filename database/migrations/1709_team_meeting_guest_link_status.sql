-- Sharing a participant URL does not disable the waiting room.
ALTER TABLE provider_schedule_events
  ADD COLUMN guest_link_shared_at DATETIME NULL;
