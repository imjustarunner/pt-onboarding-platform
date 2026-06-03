-- Migration 840: separate photo preference for when a guardian picks up themselves
ALTER TABLE clients
  ADD COLUMN guardian_self_photo_preference TINYINT(1) NULL DEFAULT NULL
  COMMENT '1 = guardian opted in to being photographed when they pick up, 0 = opted out, NULL = skip photo';
