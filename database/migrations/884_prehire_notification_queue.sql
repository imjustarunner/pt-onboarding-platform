-- Migration 884: Batched pre-hire notification queue
-- When documents/tasks are added to an existing pre-hire, queue a single
-- email notification that fires 15 minutes after the first item is queued.

CREATE TABLE prehire_notification_queue (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL COMMENT 'Candidate user_id',
  agency_id     INT          NOT NULL,
  fire_at       TIMESTAMP    NOT NULL COMMENT 'When to send the batched email',
  status        ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  items_json    JSON         NULL COMMENT 'Array of {type, title} added items',
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pnq_status_fire  (status, fire_at),
  INDEX idx_pnq_user_status  (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Batched pre-hire candidate notification queue';
