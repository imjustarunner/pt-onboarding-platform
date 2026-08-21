-- Migration 1275: Default agency preference for multi-tenant users
ALTER TABLE user_agencies
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Preferred agency for directory filters / new-client handling'
    AFTER is_active;
