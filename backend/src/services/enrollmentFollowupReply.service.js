import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import Notification from '../models/Notification.model.js';

const normalize = value => String(value || '').trim().toLowerCase();
const messageIds = value => String(value || '').match(/<[^<>\s]+>/g) || [];

/** Only Gmail's receiving authentication result can authorize an automatic reopen. */
export function enrollmentReplyIsHuman({ headers, fromEmail, authenticationResults }) {
  const get = key => headers instanceof Map ? headers.get(key) : headers?.[key];
  const auto = normalize(get('auto-submitted'));
  if (auto && auto !== 'no') return false;
  if (/all/i.test(get('x-auto-response-suppress') || '') || /^(bulk|junk)$/i.test(get('precedence') || '')) return false;
  if (/delivery-status|disposition-notification|multipart\/report/i.test(get('content-type') || '')) return false;
  const domain = normalize(fromEmail).split('@')[1];
  if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return false;
  const proof = String(authenticationResults || '').toLowerCase();
  const escaped = domain.replaceAll('.', '\\.');
  return /^mx\.google\.com\s*;/.test(proof.trim())
    && new RegExp(`dmarc=pass\\b[^;\\n]*header\\.from=${escaped}(?=[;\\s]|$)`).test(proof);
}

export async function reopenEnrollment({ clientId, agencyId, actorUserId = null, followupId = null, replyMessageId = null }, overrides = {}) {
  const d = { pool, Client, Notification, ...overrides };
  const db = await d.pool.getConnection();
  let result;
  let recipientUserId;
  try {
    await db.beginTransaction();
    const [[client]] = await db.execute(`SELECT c.*,s.status_key AS client_status_key FROM clients c
      LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=? AND c.agency_id=? FOR UPDATE`, [clientId, agencyId]);
    if (!client) throw Object.assign(new Error('Client not found.'), { status: 404 });
    if (client.compliance_archived_at) throw Object.assign(new Error('This record requires a separate retention review before reopening.'), { status: 409 });
    let action;
    if (followupId) {
      [[action]] = await db.execute('SELECT * FROM client_enrollment_followups WHERE id=? AND client_id=? AND agency_id=? FOR UPDATE', [followupId, clientId, agencyId]);
      if (!action || action.state !== 'awaiting_reply' || Number(client.enrollment_followup_id) !== Number(action.id)) {
        await db.rollback();
        return { reopened: false, reason: 'already_reopened_or_superseded' };
      }
      const expected = action.disposition === 'waitlist' ? ['waitlist'] : ['inactive','terminated'];
      const expectedWorkflow = action.disposition === 'waitlist' ? 'PENDING_REVIEW' : 'ARCHIVED';
      if (!expected.includes(normalize(client.client_status_key)) || client.status !== expectedWorkflow || client.provider_id) {
        await db.rollback();
        return { reopened: false, reason: 'client_status_changed' };
      }
      recipientUserId = action.created_by_user_id;
    } else if (client.status !== 'ARCHIVED') {
      throw Object.assign(new Error('This client is already available in the active enrollment workspace.'), { status: 409 });
    }
    const [[prospective]] = await db.execute("SELECT id FROM client_statuses WHERE agency_id=? AND status_key='prospective' AND is_active=1 LIMIT 1", [agencyId]);
    if (!prospective) throw Object.assign(new Error('The prospective client status must be configured before reopening enrollment.'), { status: 409 });
    await d.Client.update(clientId, {
      status: 'PENDING_REVIEW', client_status_id: prospective.id,
      enrollment_followup_id: followupId || null,
      enrollment_reopened_at: new Date(), enrollment_reopened_source: followupId ? 'email_reply' : 'staff'
    }, actorUserId, { executor: db, hydrate: false, agencyId });
    await db.execute(`INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)`,
      [clientId, actorUserId, 'client_status_id', String(client.client_status_id || ''), String(prospective.id),
        followupId ? `Automation: reopened the existing enrollment after a verified reply to final follow-up #${followupId}. Staff review and provider assignment are pending. Original inactive history retained.` : 'Staff reopened the existing enrollment for review. Original inactive history retained.']);
    if (followupId) await db.execute("UPDATE client_enrollment_followups SET state='reopened',reopened_at=CURRENT_TIMESTAMP,reply_message_id=? WHERE id=?", [replyMessageId, followupId]);
    await db.commit();
    result = { reopened: true, clientId, agencyId };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  if (recipientUserId) {
    await d.Notification.create({
      type: 'inbound_client_message', severity: 'info', title: 'Enrollment reopened by email reply',
      message: 'A family replied to your final follow-up. Their existing record is back in New Enrollments for review.',
      userId: recipientUserId, agencyId, relatedEntityType: 'client', relatedEntityId: clientId,
      actorUserId: null, actorSource: 'enrollment_reply_automation'
    }).catch(() => {});
  }
  return result;
}

export async function ingestEnrollmentFollowupReply(input, overrides = {}) {
  const d = { pool, reopenEnrollment, ...overrides };
  if (!enrollmentReplyIsHuman(input)) return { matched: false };
  const references = [...new Set([...messageIds(input.inReplyTo), ...messageIds(input.referencesHeader)])];
  if (!references.length || !input.messageId) return { matched: false };
  const addresses = [...new Set((input.addresses || []).map(normalize))];
  if (!addresses.length) return { matched: false };
  const [actions] = await d.pool.execute(`SELECT id,client_id,agency_id,reply_to_email FROM client_enrollment_followups
    WHERE internet_message_id IN (${references.map(() => '?').join(',')}) AND recipient_email=?
      AND state IN ('awaiting_reply','reopened') ORDER BY id DESC LIMIT 2`, [...references, normalize(input.fromEmail)]);
  const matches = actions.filter(action => addresses.includes(normalize(action.reply_to_email)));
  if (matches.length !== 1) return { matched: false };
  const action = matches[0];
  const result = await d.reopenEnrollment({ clientId: action.client_id, agencyId: action.agency_id, followupId: action.id, replyMessageId: input.messageId, actorUserId: null });
  return { matched: true, clientId: action.client_id, agencyId: action.agency_id, ...result };
}
