-- Migration 828: capture who physically checked a client in at the kiosk
-- The step-by-step kiosk check-in now asks the adult to identify themselves
-- (a guardian, an approved pickup, or "someone else") and sign. We store
-- that attribution alongside the attendance row so staff can see who dropped
-- the child off and reconcile it against the authorized-pickup list.

ALTER TABLE event_day_kiosk_checkins
  ADD COLUMN checked_in_by_name VARCHAR(160) NULL DEFAULT NULL
    COMMENT 'Name of the adult who checked the client in'
    AFTER absence_reason,
  ADD COLUMN checked_in_by_relationship VARCHAR(80) NULL DEFAULT NULL
    COMMENT 'Relationship of the checking-in adult to the client'
    AFTER checked_in_by_name,
  ADD COLUMN checked_in_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Guardian user id when the checking-in adult is a linked guardian'
    AFTER checked_in_by_relationship,
  ADD COLUMN checkin_signature_data LONGTEXT NULL DEFAULT NULL
    COMMENT 'Signature data URL captured when an unlisted adult checks the client in';
