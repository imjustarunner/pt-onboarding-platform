-- Migration 992: optional photo for office rooms (quick-view in booking UI)
ALTER TABLE office_rooms
  ADD COLUMN photo_url VARCHAR(512) NULL DEFAULT NULL
  COMMENT 'Optional room photo URL for booking quick-view';
