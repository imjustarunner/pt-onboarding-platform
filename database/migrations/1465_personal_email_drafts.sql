CREATE TABLE IF NOT EXISTS communication_email_drafts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  conversation_id INT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'new',
  draft_json LONGTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  state VARCHAR(16) NOT NULL DEFAULT 'editing',
  send_result_json TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_email_drafts_owner(user_id,agency_id,state,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve real legacy drafts for the explicitly assigned owner only. Opening
-- email used to save a Re: subject with an empty body; those are not drafts.
INSERT IGNORE INTO communication_email_drafts(id,user_id,agency_id,conversation_id,mode,draft_json)
SELECT CONCAT('legacy-',c.id),c.owner_user_id,c.agency_id,c.id,'reply',
  JSON_OBJECT('subject',COALESCE(CASE WHEN JSON_VALID(c.draft_body) THEN JSON_UNQUOTE(JSON_EXTRACT(c.draft_body,'$.subject')) END,c.subject,''),
    'to',COALESCE((SELECT p.email FROM communication_participants p WHERE p.conversation_id=c.id AND p.is_primary=1 ORDER BY p.id LIMIT 1),''),
    'text',CASE WHEN JSON_VALID(c.draft_body) THEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.draft_body,'$.body')),'') ELSE c.draft_body END,
    'cc','','bcc','','quotedText','','attachments',JSON_ARRAY())
FROM communication_conversations c
WHERE c.channel='email' AND c.owner_user_id IS NOT NULL
  AND (c.last_message_at IS NULL OR c.draft_updated_at>c.last_message_at)
  AND TRIM(CASE WHEN JSON_VALID(c.draft_body) THEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.draft_body,'$.body')),'') ELSE COALESCE(c.draft_body,'') END) NOT IN ('','<p></p>');

-- Remove only empty, auto-generated email drafts from the older shared field.
UPDATE communication_conversations
SET draft_body=NULL,draft_updated_at=NULL
WHERE channel='email' AND JSON_VALID(draft_body)
  AND CASE WHEN JSON_VALID(draft_body) THEN
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(draft_body,'$.method')),'email')='email'
    AND TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(draft_body,'$.body')),'')) IN ('','<p></p>')
  ELSE FALSE END;
