-- Migration 1007: provider product-help requests + admin escalate to platform
-- Providers/staff can flag a tenant ticket as needing platform help; it stays in the
-- tenant queue until an admin escalates (target_scope → platform).

ALTER TABLE support_tickets
  ADD COLUMN requests_platform_help TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = submitter asked for platform/product help; visible to tenant admins first';

ALTER TABLE support_tickets
  ADD COLUMN escalated_to_platform_at DATETIME NULL DEFAULT NULL
  COMMENT 'When a tenant admin escalated this ticket to Plot Twist HQ';

ALTER TABLE support_tickets
  ADD COLUMN escalated_to_platform_by_user_id INT NULL DEFAULT NULL
  COMMENT 'User who escalated the ticket to platform support';
