-- Migration: Add actor_user_id to notifications
-- Description: Track who performed the action that triggered the notification (e.g., who updated a checklist)

ALTER TABLE notifications
  ADD COLUMN actor_user_id INT NULL COMMENT 'User who performed the action that triggered this notification' AFTER related_entity_id,
  ADD CONSTRAINT fk_notifications_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_notifications_actor_user_id (actor_user_id);
