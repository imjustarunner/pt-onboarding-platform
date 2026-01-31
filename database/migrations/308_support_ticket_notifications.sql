-- Migration: Support ticket notification icon + org-type scope
-- Description:
--  - Add an agency/platform configurable icon for support ticket notifications
--  - Add per-agency org-type scope so agencies can opt into ticket notifications

-- Icon override for support ticket notifications (platform default)
ALTER TABLE platform_branding
ADD COLUMN support_ticket_created_icon_id INT NULL;

ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_support_ticket_created_icon
FOREIGN KEY (support_ticket_created_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Icon override for support ticket notifications (agency override)
ALTER TABLE agencies
ADD COLUMN support_ticket_created_icon_id INT NULL;

ALTER TABLE agencies
ADD CONSTRAINT fk_agency_support_ticket_created_icon
FOREIGN KEY (support_ticket_created_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Per-agency scope of which org-types should generate ticket notifications.
-- Example: ["school","program"] (defaults handled in application layer when NULL).
ALTER TABLE agencies
ADD COLUMN ticketing_notification_org_types_json JSON NULL;

