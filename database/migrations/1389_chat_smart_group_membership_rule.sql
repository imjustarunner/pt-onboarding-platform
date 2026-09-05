-- Migration 1389: Smart chat group membership rules (Office Available, supervisor supervisees)
ALTER TABLE chat_threads
  ADD COLUMN membership_rule VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'office_available | supervisor_supervisees | null for manual'
    AFTER thread_type;

ALTER TABLE chat_threads
  ADD COLUMN membership_owner_user_id INT NULL DEFAULT NULL
    COMMENT 'For supervisor_supervisees: the supervisor user id'
    AFTER membership_rule;

ALTER TABLE chat_threads
  ADD INDEX idx_chat_threads_membership_rule (agency_id, membership_rule, membership_owner_user_id);
