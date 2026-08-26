-- Migration 1313: Unified Inbox Phase 4 — AI cache + search helpers + response-time support

ALTER TABLE communication_conversations
  ADD COLUMN ai_summary TEXT NULL
    COMMENT 'Cached thread summary from AI assist'
    AFTER draft_updated_at,
  ADD COLUMN ai_suggested_action VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Cached suggested next action'
    AFTER ai_summary,
  ADD COLUMN ai_summary_at DATETIME NULL
    COMMENT 'When AI summary was last generated'
    AFTER ai_suggested_action;

ALTER TABLE communication_messages
  ADD FULLTEXT INDEX ft_comm_msg_body (body_text);

ALTER TABLE communication_conversations
  ADD FULLTEXT INDEX ft_comm_conv_subject (subject);

ALTER TABLE communication_participants
  ADD INDEX idx_comm_part_name (display_name);

ALTER TABLE communication_attachments
  ADD INDEX idx_comm_att_filename (filename);
