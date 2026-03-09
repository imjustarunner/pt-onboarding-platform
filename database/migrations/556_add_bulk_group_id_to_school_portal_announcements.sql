-- Add bulk_group_id to school_portal_announcements so announcements created
-- together via bulk-post can be managed (listed / edited / deleted) as a group.
ALTER TABLE school_portal_announcements
  ADD COLUMN bulk_group_id VARCHAR(36) NULL AFTER created_by_user_id;

CREATE INDEX idx_spa_bulk_group_id ON school_portal_announcements (bulk_group_id);
