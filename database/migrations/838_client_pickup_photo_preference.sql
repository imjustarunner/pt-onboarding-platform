-- Migration 838: add pickup photo preference flag to clients
ALTER TABLE clients
  ADD COLUMN pickup_photo_preference TINYINT(1) NULL DEFAULT NULL
  COMMENT '1 = guardian opted in to pickup photos, 0 = opted out, NULL = not yet asked';
