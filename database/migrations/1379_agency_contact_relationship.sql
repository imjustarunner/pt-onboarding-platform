-- Migration 1379: relationship of agency contact to linked client (parent, school staff, etc.)
ALTER TABLE agency_contacts
  ADD COLUMN relationship_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
  COMMENT 'Relationship to linked client: parent, school_staff, case_manager, referral_source, other';
