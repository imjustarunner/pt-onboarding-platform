-- Migration: Add organization context to platform chat threads
-- Description: Allows chats to be scoped to a school/program/learning organization for portal messaging.

ALTER TABLE chat_threads
  ADD COLUMN organization_id INT NULL AFTER agency_id,
  ADD INDEX idx_chat_threads_org_updated (organization_id, updated_at),
  ADD CONSTRAINT fk_chat_threads_organization
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL;

