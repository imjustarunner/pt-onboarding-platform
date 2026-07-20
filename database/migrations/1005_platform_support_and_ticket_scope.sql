-- Migration 1005: platform-level support team + platform ticket scope
-- Lets super_admin grant platform support without full super_admin.
-- Tenant admins can file tickets to the platform team (target_scope=platform).

ALTER TABLE users
  ADD COLUMN has_platform_support TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, user is on the platform support team (cross-tenant platform tickets; not full super_admin)';

CREATE INDEX idx_users_has_platform_support
  ON users (has_platform_support);

ALTER TABLE support_tickets
  ADD COLUMN target_scope VARCHAR(20) NOT NULL DEFAULT 'tenant'
  COMMENT 'tenant = normal org queue; platform = Plot Twist HQ / platform support queue';

CREATE INDEX idx_support_tickets_target_scope
  ON support_tickets (target_scope, status);
