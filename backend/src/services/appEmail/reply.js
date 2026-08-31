/**
 * Reply + session helpers for app@tenant.
 */
import pool from '../../config/database.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import GoogleWorkspaceEmailService from '../googleWorkspaceEmail.service.js';

export function subjectForReply(originalSubject) {
  const s = String(originalSubject || '').trim();
  if (!s) return 'Re: App';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export async function replyFromAppMailbox({
  senderIdentityId,
  to,
  subject,
  text,
  messageIdHeader = null,
  userId = null
} = {}) {
  const body = String(text || '').trim();
  if (!body || !to) return { skipped: true };

  try {
    const result = await sendEmailFromIdentity({
      senderIdentityId,
      to,
      subject: subjectForReply(subject),
      text: body,
      html: `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;line-height:1.45">${escapeHtml(body)}</pre>`,
      inReplyTo: messageIdHeader || undefined,
      references: messageIdHeader || undefined,
      userId: userId || undefined
    });
    if (result?.skipped) {
      await GoogleWorkspaceEmailService.sendEmail({
        to,
        subject: subjectForReply(subject),
        text: body,
        html: undefined
      });
    }
    return { ok: true };
  } catch (err) {
    console.error('[AppEmail] reply failed:', err);
    try {
      await GoogleWorkspaceEmailService.sendEmail({
        to,
        subject: subjectForReply(subject),
        text: body
      });
      return { ok: true, fallback: true };
    } catch (err2) {
      console.error('[AppEmail] fallback reply failed:', err2);
      return { ok: false, error: err2?.message || String(err2) };
    }
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function getSession(agencyId, userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, user_id, intent_key, state_json, expires_at
       FROM app_email_sessions
       WHERE agency_id = ? AND user_id = ?
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [agencyId, userId]
    );
    const row = rows?.[0];
    if (!row) return null;
    let state = row.state_json;
    if (typeof state === 'string') {
      try { state = JSON.parse(state); } catch { state = {}; }
    }
    return {
      id: row.id,
      agencyId: row.agency_id,
      userId: row.user_id,
      intentKey: row.intent_key,
      state: state || {},
      expiresAt: row.expires_at
    };
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

export async function setSession(agencyId, userId, intentKey, state = {}, ttlMinutes = 60) {
  const expiresMysql = new Date(Date.now() + ttlMinutes * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  try {
    await pool.execute(
      `INSERT INTO app_email_sessions (agency_id, user_id, intent_key, state_json, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         intent_key = VALUES(intent_key),
         state_json = VALUES(state_json),
         expires_at = VALUES(expires_at),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, userId, intentKey, JSON.stringify(state || {}), expiresMysql]
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return;
    throw err;
  }
}

export async function clearSession(agencyId, userId) {
  try {
    await pool.execute(
      `DELETE FROM app_email_sessions WHERE agency_id = ? AND user_id = ?`,
      [agencyId, userId]
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return;
    throw err;
  }
}
