-- Migration 1390: Allow Mark unread for outbound-only email threads (show in Unread)
ALTER TABLE communication_conversation_reads
  ADD COLUMN forced_unread TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = user marked unread; show in Unread even without new inbound'
    AFTER last_read_at;
