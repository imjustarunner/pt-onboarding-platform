// Personal mailbox labels follow the current account name. Addresses, routing,
// shared mailboxes and already-sent message bodies are never rewritten.
export async function syncPersonalMailboxDisplayName(db, userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A valid mailbox owner is required');
  await db.execute(`UPDATE communication_inboxes i
    JOIN users u ON u.id=i.owner_user_id
    LEFT JOIN email_sender_identities e ON e.id=i.sender_identity_id AND e.identity_key COLLATE utf8mb4_unicode_ci=CONCAT('personal_',u.id) COLLATE utf8mb4_unicode_ci AND e.agency_id=i.agency_id
    SET i.display_name=CONCAT(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)),
      IF(i.display_name LIKE '%(My Inbox)',' (My Inbox)',' (App inbox)')),
      e.display_name=TRIM(CONCAT_WS(' ',u.first_name,u.last_name))
    WHERE i.owner_user_id=? AND i.kind='personal'
      AND TRIM(CONCAT_WS(' ',u.first_name,u.last_name))<>''
      AND (CONVERT(i.display_name USING utf8mb4) COLLATE utf8mb4_unicode_ci <> CONVERT(CONCAT(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)),
        IF(i.display_name LIKE '%(My Inbox)',' (My Inbox)',' (App inbox)')) USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR (e.id IS NOT NULL AND NOT (CONVERT(e.display_name USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> CONVERT(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci)))`, [id]);
}
