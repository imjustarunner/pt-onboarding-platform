-- Keep historical notice/template classification bounded by tenant, template
-- and subject before checking provider message/thread evidence.
SET @message_category_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_communications'
    AND INDEX_NAME='idx_communications_inbox_category'
);
SET @message_category_index_sql = IF(@message_category_index_exists>0,'SELECT 1',
  'ALTER TABLE user_communications ADD INDEX idx_communications_inbox_category (agency_id,template_type,subject(191)), ALGORITHM=INPLACE, LOCK=NONE');
PREPARE message_category_index_stmt FROM @message_category_index_sql;
EXECUTE message_category_index_stmt;
DEALLOCATE PREPARE message_category_index_stmt;
