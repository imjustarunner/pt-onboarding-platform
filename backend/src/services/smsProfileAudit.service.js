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

  const client = await Client.findByContactPhone(normalized);
  if (client?.id) {
    return {
      clientId: client.id,
      userId: null,
      clients: [client],
      matchType: 'client'
    };
  }

  // Guardian / user phones (exact + last-10 digit fallback)
  const digits = normalized.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const [userRows] = await pool.execute(
    `SELECT id, role, phone_number, personal_phone, work_phone
     FROM users
     WHERE phone_number = ? OR personal_phone = ? OR work_phone = ?
        OR RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(phone_number,''), '+', ''), '-', ''), ' ', ''), 10) = ?
        OR RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(personal_phone,''), '+', ''), '-', ''), ' ', ''), 10) = ?
        OR RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(work_phone,''), '+', ''), '-', ''), ' ', ''), 10) = ?
     LIMIT 5`,
    [normalized, normalized, normalized, last10, last10, last10]
  );
  const user = (userRows || [])[0] || null;
  if (!user?.id) {
    return { clientId: null, userId: null, clients: [], matchType: null };
  }

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
