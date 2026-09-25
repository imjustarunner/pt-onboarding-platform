import pool from '../config/database.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import Directory from './googleWorkspaceDirectory.service.js';

// Older personal sends used the shared messages@ Reply-To. Recover only an
// unambiguous original conversation whose outbound recipients include this sender.
export async function resolvePersonalReplyMailbox({ identityId, fromEmail, inReplyTo, referencesHeader, threadId }) {
  const [identities] = await pool.execute("SELECT agency_id FROM email_sender_identities WHERE id=? AND identity_key IN ('messages','messages_at_tenant') AND is_active=1", [identityId]);
  if (!identities[0]) return null;
  const email = String(fromEmail || '').trim().toLowerCase();
  const parents = replyMessageIds(inReplyTo, referencesHeader);
  const matches = async (condition, values) => {
    const [rows] = await pool.execute(`SELECT DISTINCT esi.*, i.id AS inbox_id, i.owner_user_id, c.id AS reply_conversation_id
      FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
      JOIN communication_inboxes i ON i.id=c.inbox_id JOIN email_sender_identities esi ON esi.id=i.sender_identity_id
      WHERE c.agency_id=? AND i.kind='personal' AND i.is_active=1 AND esi.is_active=1
        AND EXISTS (SELECT 1 FROM users owner JOIN user_agencies membership ON membership.user_id=owner.id AND membership.agency_id=c.agency_id AND membership.is_active=1 WHERE owner.id=i.owner_user_id AND owner.is_active=1 AND COALESCE(owner.is_archived,0)=0 AND UPPER(owner.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING'))
        AND m.direction='outbound' AND m.send_status='sent'
        AND (JSON_CONTAINS(LOWER(CAST(m.to_json AS CHAR)), JSON_OBJECT('email', ?)) OR JSON_CONTAINS(LOWER(CAST(m.cc_json AS CHAR)), JSON_OBJECT('email', ?)))
        AND ${condition} LIMIT 2`, [identities[0].agency_id, email, email, ...values]);
    return rows;
  };
  for (const parent of parents) {
    const rows = await matches('m.internet_message_id=?', [parent]);
    if (rows.length) return rows.length === 1 ? rows[0] : null;
  }
  if (threadId && parents.length) {
    const rows = await matches('c.external_thread_id=?', [threadId]);
    if (rows.length) return rows.length === 1 ? rows[0] : null;
    // A reply to a Group invitation can come from a current Group member. Keep
    // the recipient check: only verified membership in an originally addressed
    // tenant Group permits this fallback, and ambiguous threads fail closed.
    const [groupCandidates] = await pool.execute(`SELECT esi.*, i.id AS inbox_id, i.owner_user_id, c.id AS reply_conversation_id, m.to_json, m.cc_json
      FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
      JOIN communication_inboxes i ON i.id=c.inbox_id JOIN email_sender_identities esi ON esi.id=i.sender_identity_id
      WHERE c.agency_id=? AND c.external_thread_id=? AND i.kind='personal' AND i.is_active=1 AND esi.is_active=1
        AND EXISTS (SELECT 1 FROM users owner JOIN user_agencies membership ON membership.user_id=owner.id AND membership.agency_id=c.agency_id AND membership.is_active=1 WHERE owner.id=i.owner_user_id AND owner.is_active=1 AND COALESCE(owner.is_archived,0)=0 AND UPPER(owner.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING'))
        AND m.direction='outbound' AND m.send_status='sent' ORDER BY m.id DESC LIMIT 2`, [identities[0].agency_id,threadId]);
    if (groupCandidates.length !== 1 || !Directory.isConfigured()) return null;
    const candidate = groupCandidates[0];
    const parse = value => typeof value === 'string' ? JSON.parse(value) : value || [];
    const domain = String(candidate.from_email).split('@')[1].toLowerCase();
    const admin = await Directory.getClient();
    for (const recipient of [...parse(candidate.to_json), ...parse(candidate.cc_json)]) {
      const group = String(recipient.email || '').toLowerCase();
      if (!group.endsWith(`@${domain}`) || !await Directory.getGroup({groupEmail:group})) continue;
      const membership = await admin.members.hasMember({groupKey:group,memberKey:email});
      if (membership.data?.isMember) return candidate;
    }
  }
  return null;
}
