import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import VonageService from './vonage.service.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';

export const OUT_OF_OFFICE_SMS = `I'm out of the office and will reply when I return. Texts don't replace a session. Emergencies: call 911; for suicide or emotional crisis, call/text 988. Reply NOOO ("No out-of-office notices") to stop away notices; direct texting stays on. STOP stops all texts.`;

export function communicationRulesNotice(agency) {
  const url = new URL('/community-standards', buildPublicPortalBaseUrl(agency)).href;
  return `${agency.name || 'Your care team'}: You've contacted your provider, who will reply as soon as able. Text here for care coordination and changes outside automated scheduling, not to replace a session. Texts are saved in your protected care record for authorized care staff. The portal is recommended for sensitive details; you can still text here. Rules: ${url}`;
}

// One introduction per recipient/inbox, then one notice per recorded absence.
// The shared lock also prevents an ordinary inbound and an away inbound racing.
export async function sendConversationStartNotice({ agencyId, numberId, clientId, userId, from, to, inboundLogId, absenceKey = null }) {
  if (!agencyId || !numberId || !clientId || !inboundLogId) return false;
  const recipient = MessageLog.normalizePhone?.(to) || to;
  const db = await pool.getConnection();
  const lock = `sms-notice-${createHash('sha256').update(`${agencyId}:${numberId}:${recipient}`).digest('hex').slice(0,40)}`;
  let locked = false;
  try {
    const [locks] = await db.execute('SELECT GET_LOCK(?, 2) AS acquired', [lock]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) return false;
    const [introduced] = await db.execute(`SELECT id FROM message_logs WHERE agency_id=? AND number_id=?
      AND direction='OUTBOUND' AND to_number=?
      AND delivery_status IN ('pending','queued','sent','delivered')
      AND JSON_EXTRACT(metadata, '$.communicationNotice')=true LIMIT 1`, [agencyId, numberId, recipient]);
    let sendAway = false;
    if (absenceKey) {
      const [disabled] = await db.execute(`SELECT id FROM message_logs WHERE agency_id=? AND number_id=?
        AND direction='INBOUND' AND from_number=?
        AND JSON_EXTRACT(metadata, '$.outOfOfficeNoticesDisabled')=true LIMIT 1`, [agencyId, numberId, recipient]);
      if (!disabled.length) {
        const [notified] = await db.execute(`SELECT id FROM message_logs WHERE agency_id=? AND number_id=?
          AND direction='OUTBOUND' AND to_number=?
          AND delivery_status IN ('pending','queued','sent','delivered')
          AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.absenceKey'))=? LIMIT 1`, [agencyId, numberId, recipient, absenceKey]);
        sendAway = !notified.length;
      }
    }
    const sendIntro = !introduced.length;
    if (!sendIntro && !sendAway) return false;
    const agency = await Agency.findById(agencyId);
    if (!agency) return false;
    // A first contact during an absence produces one logical message, not two.
    const body = sendAway
      ? `${sendIntro ? communicationRulesNotice(agency) : (agency.name || 'Your care team') + ':'} ${OUT_OF_OFFICE_SMS}`
      : `${communicationRulesNotice(agency)} Reply STOP to stop all texts.`;
    const metadata = { communicationNotice: sendIntro, outOfOfficeNotice: sendAway,
      ...(sendAway ? { absenceKey } : {}), triggerInboundId: inboundLogId };
    const log = await MessageLog.createOutbound({ agencyId, numberId, clientId, userId,
      fromNumber: from, toNumber: recipient, body, metadata });
    try {
      // Registration, initial opt-in and account-wide STOP still apply.
      const sent = await VonageService.sendSms({ purpose: 'care', agencyId, from, to: recipient, body });
      await MessageLog.markSent(log.id, sent.sid, metadata);
    } catch (error) {
      await MessageLog.markFailed(log.id, error.code || 'sms_send_failed');
      return false;
    }
    return true;
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}
