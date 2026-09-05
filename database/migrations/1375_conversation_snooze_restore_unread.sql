-- Migration 1375: when a snooze ends, restore unread for Hub / inbox UX
ALTER TABLE communication_conversations
  ADD COLUMN snooze_restore_unread TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When snoozed_until passes, clear snooze and mark unread again';
