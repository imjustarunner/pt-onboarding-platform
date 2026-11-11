-- Resume a retained device only while its server-owned activity grant is valid.
-- Historical devices start locked; a real primary sign-in or account unlock opens it.
ALTER TABLE mobile_device_sessions
  ADD COLUMN unlocked_until DATETIME(3) NULL;
