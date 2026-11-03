// The original inbound row is the canonical handoff. Locking it makes requests
// from the family and multiple providers converge on one Support ticket.
export async function requestSmsSupportHandoff(db, { agencyId, numberId, clientId, inboundLogId, requestedByUserId, reason, expectedFromNumber }) {
  const [rows] = await db.execute(`SELECT * FROM message_logs WHERE id=? AND agency_id=? AND number_id=?
    AND client_id=? AND direction='INBOUND' FOR UPDATE`, [inboundLogId, agencyId, numberId, clientId]);
  const original = rows[0];
  if (!original) throw Object.assign(new Error('Original message is unavailable'), { code: 'handoff_message_unavailable' });
  if (expectedFromNumber && original.from_number !== expectedFromNumber) {
    throw Object.assign(new Error('Original message recipient changed'), { code: 'handoff_recipient_changed' });
  }
  const metadata = typeof original.metadata === 'string' ? JSON.parse(original.metadata) : original.metadata || {};
  if (metadata.supportChoiceTicketId) return { ticketId: Number(metadata.supportChoiceTicketId), original, created: false };
  const [ticket] = await db.execute(`INSERT INTO support_tickets
    (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority, close_on_read)
    VALUES (?, ?, ?, ?, ?, ?, 'open', 'high', 0)`, [agencyId, clientId, requestedByUserId || original.user_id, agencyId,
    'SMS message forwarded to Support',
    `Support was requested for SMS message #${Number(original.id)} (${reason === 'scheduling_request' ? 'scheduling request' : reason === 'provider_request' ? 'provider request' : 'provider unavailable'}). Open the SMS conversation in Communication Hub to review the original message and reply. Claim and close this ticket when handled. No appointment has been changed automatically.`]);
  const ticketId = ticket.insertId;
  await db.execute(`UPDATE message_logs SET metadata=JSON_SET(COALESCE(metadata, JSON_OBJECT()),
    '$.supportChoiceOffer', true, '$.supportChoiceAccepted', true, '$.supportChoiceTicketId', ?,
    '$.supportHandoffReason', ?, '$.supportRequestedByUserId', ?, '$.supportRequestedByProvider', ?,
    '$.supportChoiceAcceptedAt', UTC_TIMESTAMP()) WHERE id=?`,
  [ticketId, reason, requestedByUserId || null, Boolean(requestedByUserId), original.id]);
  await db.execute(`INSERT INTO sms_care_threads
    (agency_id, number_id, client_id, owner_user_id, care_state, support_access, support_ticket_id, last_inbound_at)
    VALUES (?, ?, ?, ?, 'escalated', 'respond', ?, ?)
    ON DUPLICATE KEY UPDATE care_state='escalated', support_access='respond', support_ticket_id=VALUES(support_ticket_id), updated_at=CURRENT_TIMESTAMP`,
  [agencyId, numberId, clientId, original.assigned_user_id || original.user_id || null, ticketId, original.created_at]);
  return { ticketId, original, created: true };
}

export async function markSmsSupportOfferAccepted(db, offerId, ticketId, messageId, originalId) {
  await db.execute(`UPDATE message_logs SET metadata=JSON_SET(COALESCE(metadata, JSON_OBJECT()),
    '$.supportChoiceTicketId', ?, '$.supportChoiceReplyId', ?, '$.supportCanonicalInboundId', ?,
    '$.supportChoiceAcceptedAt', UTC_TIMESTAMP()) WHERE id=?`, [ticketId, messageId || null, originalId, offerId]);
}

// Detection only offers a handoff; it never changes appointments or forwards content.
export function looksLikeSchedulingRequest(body) {
  return /\b(cancel(?:l?ed|l?ing|lation)?|reschedul\w*|re[- ]schedule|rebook\w*)\b|\b(change|move|switch)\b.{0,50}\b(appointment|session|time|day)\b|\b(can'?t|cannot|unable to)\s+(make|attend)\b/i.test(String(body || ''));
}
