/**
 * School Ready-to-Schedule digests.
 *
 * Send windows (America/Denver):
 *   - Monday 10:00 → covers Fri 10:01 → Mon 09:59
 *   - Wednesday 10:00 → covers Mon 10:01 → Wed 09:59
 *   - Friday 10:00 → covers Wed 10:01 → Fri 09:59
 *
 * While the window is open, a pending draft in Automations is updated as each
 * client is marked Ready to Schedule.
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const TZ = 'America/Denver';
const SCHOOLS_REPLY_TO = 'schools@itsco.health';
const TEMPLATE_TYPE = 'school_ready_to_schedule_digest';

function denverParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute)
  };
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Next Mon/Wed/Fri 10:00 MT send slot strictly after the previous window closed (now). */
export function getReadyScheduleDigestWindow(now = new Date()) {
  const p = denverParts(now);
  const minutesNow = p.hour * 60 + p.minute;
  const sendMinute = 10 * 60;

  // Find next Mon(1)/Wed(3)/Fri(5) where local time is still before 10:00, else jump ahead.
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const cp = denverParts(probe);
    if (![1, 3, 5].includes(cp.weekday)) continue;
    if (dayOffset === 0 && minutesNow >= sendMinute) continue;
    const slotLabel = cp.weekday === 1 ? 'mon' : cp.weekday === 3 ? 'wed' : 'fri';
    return {
      windowKey: `${ymd(cp.year, cp.month, cp.day)}_${slotLabel}`,
      sendLabel: cp.weekday === 1 ? 'Monday' : cp.weekday === 3 ? 'Wednesday' : 'Friday',
      sendYmd: ymd(cp.year, cp.month, cp.day),
      dow: cp.weekday
    };
  }

  const fallback = denverParts(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  return {
    windowKey: `${ymd(fallback.year, fallback.month, fallback.day)}_wed`,
    sendLabel: 'Wednesday',
    sendYmd: ymd(fallback.year, fallback.month, fallback.day),
    dow: 3
  };
}

/** True when Denver local time is Mon/Wed/Fri and hour:minute is 10:00–10:14. */
export function isReadyScheduleDigestSendSlot(now = new Date()) {
  const p = denverParts(now);
  if (![1, 3, 5].includes(p.weekday)) return false;
  return p.hour === 10 && p.minute < 15;
}

async function getSchoolItscoEmail(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return null;
  const [rows] = await pool.execute(
    `SELECT itsco_email FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
    [sid]
  );
  return String(rows?.[0]?.itsco_email || '').trim() || null;
}

async function getSchoolName(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return 'School';
  const [rows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [sid]);
  return String(rows?.[0]?.name || 'School').trim() || 'School';
}

async function resolveNotificationsIdentityId(agencyId) {
  const aid = Number(agencyId || 0) || null;
  const notificationsEmail = 'notifications@itsco.health';
  if (aid) {
    const agencyOnly = await resolvePreferredSenderIdentityForAgency({
      agencyId: aid,
      preferredKeys: ['school_intake', 'notifications', 'intake', 'system'],
      includePlatformDefaults: false,
      onlyActive: true
    });
    if (Number(agencyOnly?.id || 0)) {
      const fe = String(agencyOnly.from_email || '').trim().toLowerCase();
      if (fe === notificationsEmail) return Number(agencyOnly.id);
    }
  }
  return null;
}

function buildDigestCopy({ schoolName, items }) {
  const list = (items || []).filter(Boolean);
  const n = list.length;
  const subject = `${schoolName} - Ready to Schedule`;
  const verb = n === 1 ? 'The following client is ready to schedule:' : 'The following clients are ready to schedule:';
  const lines = list.map((it) => {
    const initials = String(it.client_initials || '').trim();
    const label = String(it.client_label || '').trim();
    if (initials && label && !label.includes(initials)) return `• ${initials} — ${label}`;
    if (initials) return `• ${initials}`;
    if (label) return `• ${label}`;
    return `• Client #${it.client_id}`;
  });

  const text = [
    'Hello,',
    '',
    verb,
    '',
    ...lines,
    '',
    'Please log in to the school portal to review status and coordinate scheduling.',
    '',
    'Thank you,',
    `${schoolName} - Support Team`,
    '',
    'Questions? Reply to this email or contact schools@ITSCO.health.'
  ].join('\n');

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 640px;">
      <p>Hello,</p>
      <p><strong>${esc(verb)}</strong></p>
      <ul>${lines.map((l) => `<li>${esc(l.replace(/^•\s*/, ''))}</li>`).join('')}</ul>
      <p>Please log in to the school portal to review status and coordinate scheduling.</p>
      <p>Thank you,<br/><strong>${esc(`${schoolName} - Support Team`)}</strong></p>
      <p style="font-size:12px;color:#666;">Questions? Reply to this email or contact <a href="mailto:schools@ITSCO.health">schools@ITSCO.health</a>.</p>
    </div>
  `.trim();

  return { subject, text, html, count: n };
}

async function loadWindowItems({ schoolOrganizationId, windowKey }) {
  const [rows] = await pool.execute(
    `SELECT id, client_id, client_initials, client_label, marked_ready_at, digest_communication_id
     FROM school_ready_schedule_digest_items
     WHERE school_organization_id = ?
       AND window_key = ?
     ORDER BY marked_ready_at ASC, id ASC`,
    [schoolOrganizationId, windowKey]
  );
  return rows || [];
}

/**
 * Upsert a pending Automations draft and refresh its body whenever the queue changes.
 */
async function upsertPendingDigestDraft({
  agencyId,
  schoolOrganizationId,
  windowKey,
  items
}) {
  const schoolName = await getSchoolName(schoolOrganizationId);
  const to = await getSchoolItscoEmail(schoolOrganizationId);
  const { subject, text, html, count } = buildDigestCopy({ schoolName, items });
  if (!count) return null;

  const existingCommId = Number(items.find((i) => i.digest_communication_id)?.digest_communication_id || 0) || null;
  let commId = existingCommId;

  if (commId) {
    await pool.execute(
      `UPDATE user_communications
       SET subject = ?,
           body = ?,
           recipient_address = COALESCE(?, recipient_address),
           delivery_status = 'pending',
           error_message = ?,
           metadata = ?
       WHERE id = ?`,
      [
        subject,
        html || text,
        to || null,
        `Draft digest — sends ${windowKey} (~10:00 MT). ${count} client(s) ready.`,
        JSON.stringify({
          templateType: TEMPLATE_TYPE,
          windowKey,
          schoolOrganizationId,
          clientIds: items.map((i) => i.client_id),
          draft: true
        }),
        commId
      ]
    ).catch(() => {});
  } else {
    const comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId: null,
      clientId: null,
      agencyId,
      templateType: TEMPLATE_TYPE,
      templateId: null,
      subject,
      body: html || text,
      generatedByUserId: null,
      channel: 'email',
      recipientAddress: to || null,
      metadata: {
        windowKey,
        schoolOrganizationId,
        clientIds: items.map((i) => i.client_id),
        draft: true
      }
    });
    commId = comm?.id || null;
    if (commId) {
      await pool.execute(
        `UPDATE user_communications
         SET delivery_status = 'pending',
             error_message = ?
         WHERE id = ?`,
        [`Draft digest — sends ${windowKey} (~10:00 MT). ${count} client(s) ready.`, commId]
      ).catch(() => {});
    }
  }

  if (commId) {
    await pool.execute(
      `UPDATE school_ready_schedule_digest_items
       SET digest_communication_id = ?
       WHERE school_organization_id = ?
         AND window_key = ?`,
      [commId, schoolOrganizationId, windowKey]
    ).catch(() => {});
  }

  return { commId, subject, text, html, to, schoolName, count };
}

/**
 * Record a client marked Ready to Schedule into the next digest window + refresh draft.
 */
export async function enqueueReadyToScheduleDigest({
  agencyId,
  schoolOrganizationId,
  clientId,
  clientInitials = null,
  clientLabel = null
}) {
  const aid = Number(agencyId || 0);
  const sid = Number(schoolOrganizationId || 0);
  const cid = Number(clientId || 0);
  if (!aid || !sid || !cid) return null;

  const { windowKey } = getReadyScheduleDigestWindow(new Date());

  await pool.execute(
    `INSERT INTO school_ready_schedule_digest_items
       (agency_id, school_organization_id, client_id, client_initials, client_label, window_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       client_initials = COALESCE(VALUES(client_initials), client_initials),
       client_label = COALESCE(VALUES(client_label), client_label),
       marked_ready_at = CURRENT_TIMESTAMP`,
    [
      aid,
      sid,
      cid,
      clientInitials ? String(clientInitials).slice(0, 32) : null,
      clientLabel ? String(clientLabel).slice(0, 255) : null,
      windowKey
    ]
  );

  const items = await loadWindowItems({ schoolOrganizationId: sid, windowKey });
  return upsertPendingDigestDraft({
    agencyId: aid,
    schoolOrganizationId: sid,
    windowKey,
    items
  });
}

async function sendDigestForSchoolWindow({ agencyId, schoolOrganizationId, windowKey }) {
  const items = await loadWindowItems({ schoolOrganizationId, windowKey });
  if (!items.length) return { sent: false, reason: 'empty' };

  const draft = await upsertPendingDigestDraft({
    agencyId,
    schoolOrganizationId,
    windowKey,
    items
  });
  if (!draft?.to) {
    if (draft?.commId) {
      await pool.execute(
        `UPDATE user_communications
         SET delivery_status = 'failed',
             error_message = ?
         WHERE id = ?`,
        ['No school ITSCO group email configured', draft.commId]
      ).catch(() => {});
    }
    return { sent: false, reason: 'no_recipient' };
  }

  const senderIdentityId = await resolveNotificationsIdentityId(agencyId);
  if (!senderIdentityId) {
    if (draft.commId) {
      await pool.execute(
        `UPDATE user_communications
         SET delivery_status = 'failed',
             error_message = ?
         WHERE id = ?`,
        ['No notifications@itsco.health sender identity', draft.commId]
      ).catch(() => {});
    }
    return { sent: false, reason: 'no_identity' };
  }

  let portalUrl = 'https://app.itsco.health/login';
  try {
    const agency = await Agency.findById(agencyId);
    portalUrl = buildPublicAppUrl(agency || { slug: 'itsco' }, 'login') || portalUrl;
  } catch {
    // keep default
  }

  const result = await sendEmailFromIdentity({
    senderIdentityId,
    to: draft.to,
    subject: draft.subject,
    text: `${draft.text}\n\nPortal: ${portalUrl}`,
    html: draft.html,
    source: 'auto',
    agencyId,
    templateType: TEMPLATE_TYPE,
    fromDisplayNameOverride: `${draft.schoolName} - Support Team`,
    replyToOverride: SCHOOLS_REPLY_TO,
    existingCommunicationId: draft.commId || null,
    linkUrl: portalUrl
  });

  if (result?.skipped || result?.blocked) {
    return { sent: false, reason: result.reason || 'skipped' };
  }
  return { sent: true, communicationId: draft.commId || result?.communicationId || null };
}

/**
 * Called by scheduler near Mon/Wed/Fri 10:00 MT.
 * Sends the digest whose window_key matches today's send slot.
 */
export async function runReadyToScheduleDigestTick(now = new Date()) {
  if (!isReadyScheduleDigestSendSlot(now)) {
    return { ran: false, reason: 'outside_send_slot' };
  }
  const p = denverParts(now);
  const slotLabel = p.weekday === 1 ? 'mon' : p.weekday === 3 ? 'wed' : 'fri';
  const windowKey = `${ymd(p.year, p.month, p.day)}_${slotLabel}`;

  const [groups] = await pool.execute(
    `SELECT DISTINCT agency_id, school_organization_id
     FROM school_ready_schedule_digest_items
     WHERE window_key = ?`,
    [windowKey]
  );

  const results = [];
  for (const g of groups || []) {
    try {
      // Skip if already sent
      const [sentCheck] = await pool.execute(
        `SELECT uc.id
         FROM school_ready_schedule_digest_items i
         JOIN user_communications uc ON uc.id = i.digest_communication_id
         WHERE i.school_organization_id = ?
           AND i.window_key = ?
           AND uc.delivery_status IN ('sent', 'delivered')
         LIMIT 1`,
        [g.school_organization_id, windowKey]
      );
      if (sentCheck?.[0]?.id) {
        results.push({ schoolOrganizationId: g.school_organization_id, skipped: 'already_sent' });
        continue;
      }
      const out = await sendDigestForSchoolWindow({
        agencyId: g.agency_id,
        schoolOrganizationId: g.school_organization_id,
        windowKey
      });
      results.push({ schoolOrganizationId: g.school_organization_id, ...out });
    } catch (err) {
      console.error('[readyToScheduleDigest] send failed', err?.message || err);
      results.push({ schoolOrganizationId: g.school_organization_id, sent: false, error: String(err?.message || err) });
    }
  }
  return { ran: true, windowKey, results };
}

export default {
  getReadyScheduleDigestWindow,
  isReadyScheduleDigestSendSlot,
  enqueueReadyToScheduleDigest,
  runReadyToScheduleDigestTick
};
