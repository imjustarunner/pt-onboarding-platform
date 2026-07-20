-- One-time notification inbox reset for the notification settings rollout.
-- The fixed cutoff is intentional: deploying this migration later must not
-- remove notifications created after July 20, 2026.
--
-- Digest generation records are also cleared so the new daily digests can be
-- generated from a clean state. Viewer read/follow-up/dismiss state is removed
-- by the notification_user_reads ON DELETE CASCADE foreign key. SMS delivery,
-- announcement, and supervision audit rows are retained with notification_id
-- set to NULL by their foreign keys.

DELETE FROM notification_activity_digests
WHERE digest_date <= '2026-07-20';

DELETE FROM notifications
WHERE created_at < '2026-07-21 00:00:00';
