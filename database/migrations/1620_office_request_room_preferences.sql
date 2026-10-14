-- Ranked room preferences are one request for one room, not multiple bookings.
ALTER TABLE provider_office_availability_requests
  ADD COLUMN preferred_rooms_json JSON NULL;
