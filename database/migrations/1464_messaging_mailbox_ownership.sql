-- Personal sender identities were sometimes materialized as shared inboxes by
-- ensureFromSenderIdentities. Repair only exact, tenant-validated identity owners.
UPDATE communication_inboxes i
JOIN email_sender_identities e ON e.id=i.sender_identity_id
JOIN users u ON e.identity_key=CONCAT('personal_',u.id)
JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=i.agency_id
SET i.kind='personal', i.owner_user_id=u.id
WHERE e.identity_key REGEXP '^personal_[0-9]+$'
  AND e.agency_id=i.agency_id AND i.owner_user_id IS NULL;

INSERT INTO communication_inbox_members(inbox_id,user_id,role)
SELECT id,owner_user_id,'owner' FROM communication_inboxes
WHERE kind='personal' AND owner_user_id IS NOT NULL
ON DUPLICATE KEY UPDATE role=VALUES(role);
