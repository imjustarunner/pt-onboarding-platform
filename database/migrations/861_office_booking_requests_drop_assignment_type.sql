-- Migration 861: Add DROP_ASSIGNMENT request type for admin-approved slot releases
-- Replaces the old auto-forfeit: the watchdog now queues a pending DROP_ASSIGNMENT
-- request instead of auto-deactivating standing assignments after 6 weeks.

ALTER TABLE office_booking_requests
  MODIFY COLUMN request_type ENUM(
    'PROVIDER_REQUEST',
    'ADMIN_OVERRIDE',
    'DELETE_EVENT',
    'DROP_ASSIGNMENT'
  ) NOT NULL DEFAULT 'PROVIDER_REQUEST'
  COMMENT 'DROP_ASSIGNMENT = admin-reviewed release of a stale standing assignment';

-- Notification trigger keys for the new admin-reviewed drop flow.
INSERT INTO notification_triggers (trigger_key, name, description)
VALUES
  ('office_schedule_drop_review_queued',
   'Office slot pending admin review',
   'Sent to provider when a stale unbooked slot is queued for admin review instead of auto-forfeited.'),
  ('office_schedule_drop_review_kept',
   'Office slot kept by admin',
   'Sent to provider when an admin denies the drop request and keeps the slot active.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);
