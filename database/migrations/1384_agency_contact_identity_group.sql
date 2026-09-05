-- Migration 1384: link duplicate agency contacts without granting access
-- identity_group_id groups personal duplicates; visibility stays per-contact (assignment/share/created_by).

ALTER TABLE agency_contacts
  ADD COLUMN identity_group_id CHAR(36) NULL DEFAULT NULL
  COMMENT 'Shared UUID for admin/support-linked duplicate contacts; does not grant visibility'
  AFTER relationship_type;

CREATE INDEX idx_agency_contacts_identity_group
  ON agency_contacts (agency_id, identity_group_id);
