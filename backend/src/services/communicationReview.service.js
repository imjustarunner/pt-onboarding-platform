import crypto from 'node:crypto';
import pool from '../config/database.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import { resolveProfilePhoneMatch } from './smsProfileAudit.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { isCommunicationStaffActive, receptionReason, isLikelyAdvertising } from '../utils/communicationReceptionPolicy.js';

export async function enqueueCommunicationReview({ agencyId, numberId = null, channel = 'sms', externalId, reason, from = null, to = null, body = '', messageLogId = null, voicemailId = null }) {
  // Fail closed if encryption/storage fails: webhook can retry; no plaintext fallback.
  const enc = encryptChatText(String(body || ''));
  const [result] = await pool.execute(`INSERT INTO communication_review_queue
    (agency_id, number_id, channel, external_id, reason, status, from_number, to_number,
     body_ciphertext, body_iv, body_auth_tag, encryption_key_id, message_log_id, voicemail_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [agencyId, numberId, channel, String(externalId || crypto.randomUUID()), reason,
     ['blocked_sender','suspected_advertising'].includes(reason) ? 'spam' : 'review', from, to,
     enc.ciphertextB64, enc.ivB64, enc.authTagB64, enc.keyId, messageLogId, voicemailId]);
  return result.insertId;
}

export async function inspectInboundReception({ from, to, body = '' }) {
  const number = await PhoneNumber.findByPhoneNumber(to);
  if (!number?.agency_id) return { number, reason: null };
  const agencyId = Number(number.agency_id);
  const [blocked] = await pool.execute('SELECT 1 FROM communication_blocked_senders WHERE agency_id=? AND phone_number=? LIMIT 1', [agencyId, from]);
  if (blocked.length) return { number, reason: 'blocked_sender' };
  const profile = await resolveProfilePhoneMatch(from, { agencyId });
  const contact = !profile.clientId && !profile.userId ? await AgencyContact.findByPhone(from, agencyId) : null;
  const [assigned] = await pool.execute(`SELECT u.*, ua.is_active AS membership_active
    FROM twilio_number_assignments tna JOIN users u ON u.id=tna.user_id
    LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE tna.number_id=? AND tna.is_active=TRUE`, [agencyId, number.id]);
  const active = assigned.filter(u => u.membership_active === 1 && isCommunicationStaffActive(u));
  // A dedicated number must not expose a different clinician's clients to its assignee.
  let directMismatch = false;
  if (assigned.length === 1 && active.length && ['provider','provider_plus'].includes(active[0].role) && profile.clientId) {
    const [care] = await pool.execute(`SELECT 1 FROM client_provider_assignments WHERE client_id=? AND provider_user_id=? AND is_active=TRUE
      UNION SELECT 1 FROM clients WHERE id=? AND agency_id=? AND provider_id=? LIMIT 1`,
      [profile.clientId, active[0].id, profile.clientId, agencyId, active[0].id]);
    directMismatch = !care.length;
  }
  const reason = receptionReason({ blocked: false, known: !!(profile.clientId || profile.userId || contact),
    ambiguous: profile.ambiguous || (profile.clients?.length || 0) > 1,
    departed: assigned.length > 0 && active.length === 0,
    directMismatch,
    mainNumber: ['tenant_contact', 'platform_contact'].includes(number.number_purpose) });
  return { number, profile, reason: reason === 'unknown_sender' && isLikelyAdvertising(body) ? 'suspected_advertising' : reason };
}

export async function listCommunicationReview(agencyId, { status = 'review', beforeId = null } = {}) {
  const params = [agencyId, status];
  if (beforeId) params.push(beforeId);
  const [rows] = await pool.execute(`SELECT * FROM communication_review_queue WHERE agency_id=? AND status=?
    ${beforeId ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT 100`, params);
  return rows.map(row => ({ id:row.id, channel:row.channel, reason:row.reason, status:row.status,
    from:row.from_number, to:row.to_number, createdAt:row.created_at, messageLogId:row.message_log_id, voicemailId:row.voicemail_id,
    body:decryptChatText({ ciphertextB64:row.body_ciphertext, ivB64:row.body_iv, authTagB64:row.body_auth_tag, keyId:row.encryption_key_id }) }));
}

export async function reviewCommunication({ agencyId, id, action, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM communication_review_queue WHERE id=? AND agency_id=? FOR UPDATE', [id, agencyId]);
    const row=rows[0];
    if (!row) throw Object.assign(new Error('Review item not found'), { status:404 });
    if (action === 'block' && row.from_number) {
      await conn.execute(`INSERT INTO communication_blocked_senders (agency_id,phone_number,blocked_by) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE blocked_by=VALUES(blocked_by)`, [agencyId,row.from_number,userId]);
    }
    if (action === 'restore' && row.from_number) {
      await conn.execute('DELETE FROM communication_blocked_senders WHERE agency_id=? AND phone_number=?', [agencyId,row.from_number]);
    }
    const status = action === 'block' ? 'spam' : action === 'resolve' ? 'resolved' : 'review';
    await conn.execute('UPDATE communication_review_queue SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND agency_id=?', [status,userId,id,agencyId]);
    await conn.commit();
    return { id,status };
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
