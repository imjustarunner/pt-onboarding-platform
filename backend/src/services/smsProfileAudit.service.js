import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import SmsProfileAudit from '../models/SmsProfileAudit.model.js';
import MessageLog from '../models/MessageLog.model.js';

const PROFILE_PURPOSES = new Set([
  'platform_contact',
  'tenant_contact',
  'clinical_care',
  'notification',
  'appointment_verify',
  'provider_contact',
  'general'
]);

export function normalizeNumberPurpose(raw) {
  const p = String(raw || 'clinical_care').toLowerCase().trim();
  if (p === 'appointment_verify') return 'notification';
  return PROFILE_PURPOSES.has(p) ? p : 'clinical_care';
}

export function isClinicalCarePurpose(purpose) {
  return normalizeNumberPurpose(purpose) === 'clinical_care';
}

export function skipsClinicalInbox(purpose) {
  const p = normalizeNumberPurpose(purpose);
  return p !== 'clinical_care' && p !== 'general';
}

/**
 * Resolve which client / guardian user a phone belongs to for audit attachment.
 */
export async function resolveProfilePhoneMatch(phone, { agencyId = null } = {}) {
  const normalized = MessageLog.normalizePhone(phone) || Client.normalizePhone?.(phone) || null;
  if (!normalized) return { clientId: null, userId: null, clients: [] };

  const digits = normalized.replace(/\D/g, '');
  const [directClients] = await pool.execute(
    `SELECT * FROM clients WHERE REGEXP_REPLACE(COALESCE(contact_phone,''), '[^0-9]', '') IN (?, ?)
      ${agencyId ? 'AND agency_id = ?' : ''} ORDER BY id LIMIT 20`,
    [digits, digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits, ...(agencyId ? [agencyId] : [])]
  );
  if (directClients.length) return { clientId:directClients[0].id, userId:null, clients:directClients, matchType:'client' };

  const [userRows] = await pool.execute(
    `SELECT u.id,u.role FROM users u
     WHERE (REGEXP_REPLACE(COALESCE(u.phone_number,''), '[^0-9]', '') IN (?, ?)
       OR REGEXP_REPLACE(COALESCE(u.personal_phone,''), '[^0-9]', '') IN (?, ?)
       OR REGEXP_REPLACE(COALESCE(u.work_phone,''), '[^0-9]', '') IN (?, ?))
       ${agencyId ? `AND (EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=TRUE)
         OR EXISTS (SELECT 1 FROM client_guardians cg JOIN clients c ON c.id=cg.client_id WHERE cg.guardian_user_id=u.id AND c.agency_id=?))` : ''}
     ORDER BY u.id LIMIT 5`,
    [...Array(3).fill([digits, digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits]).flat(), ...(agencyId ? [agencyId,agencyId] : [])]
  );
  // A shared phone with multiple user accounts needs human identification.
  if (userRows.length !== 1) return {clientId:null,userId:null,clients:[],matchType:null,ambiguous:userRows.length > 1};
  const user = userRows[0];

  let clients = [];
  try {
    const params = [user.id];
    let agencyClause = '';
    if (agencyId) {
      agencyClause = `AND c.agency_id = ?`;
      params.push(agencyId);
    }
    const [cg] = await pool.execute(
      `SELECT c.*
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       WHERE cg.guardian_user_id = ?
         ${agencyClause}
       ORDER BY cg.id DESC
       LIMIT 20`,
      params
    );
    clients = cg || [];
  } catch {
    clients = [];
  }

  return {
    clientId: clients[0]?.id || null,
    userId: user.id,
    clients,
    matchType: 'user',
    userRole: user.role
  };
}

/**
 * Write encrypted audit row(s) when SMS involves a profile phone.
 * For guardian matches with multiple children, write one row per linked client
 * (same ciphertext metadata duplicated — compliance per-client view).
 */
export async function recordSmsProfileAudit({
  agencyId = null,
  direction,
  fromNumber,
  toNumber,
  numberId = null,
  numberPurpose = null,
  body = '',
  messageLogId = null,
  notificationSmsLogId = null,
  occurredAt = null,
  /** Prefer explicit subjects when caller already resolved them */
  clientId = null,
  userId = null
} = {}) {
  try {
    const purpose = normalizeNumberPurpose(numberPurpose);
    const peerPhone = String(direction || '').toUpperCase() === 'OUTBOUND' ? toNumber : fromNumber;
    const agencyPhone = String(direction || '').toUpperCase() === 'OUTBOUND' ? fromNumber : toNumber;

    let subjects = [];
    if (clientId || userId) {
      subjects = [{ clientId: clientId || null, userId: userId || null }];
    } else {
      const match = await resolveProfilePhoneMatch(peerPhone, { agencyId });
      if (match.matchType === 'client' && match.clientId) {
        subjects = [{ clientId: match.clientId, userId: null }];
      } else if (match.matchType === 'user' && match.userId) {
        if (match.clients?.length) {
          subjects = match.clients.map((c) => ({
            clientId: c.id,
            userId: match.userId
          }));
        } else {
          subjects = [{ clientId: null, userId: match.userId }];
        }
      }
    }

    if (!subjects.length) return [];

    const created = [];
    for (const s of subjects) {
      const row = await SmsProfileAudit.create({
        agencyId,
        clientId: s.clientId,
        userId: s.userId,
        direction,
        fromNumber: MessageLog.normalizePhone(fromNumber) || fromNumber,
        toNumber: MessageLog.normalizePhone(toNumber) || toNumber,
        numberId,
        numberPurpose: purpose,
        body,
        messageLogId,
        notificationSmsLogId,
        occurredAt
      });
      if (row) created.push(row);
    }
    // agencyPhone unused — kept for future DID validation
    void agencyPhone;
    return created;
  } catch (e) {
    console.warn('[smsProfileAudit] record failed:', e?.message || e);
    return [];
  }
}

export default {
  normalizeNumberPurpose,
  isClinicalCarePurpose,
  skipsClinicalInbox,
  resolveProfilePhoneMatch,
  recordSmsProfileAudit
};
