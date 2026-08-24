/**
 * School status digests (Ready to Schedule + Waitlist).
 *
 * Send windows (America/Denver):
 *   - Monday 10:00 → covers Fri 10:01 → Mon 09:59
 *   - Wednesday 10:00 → covers Mon 10:01 → Wed 09:59
 *   - Friday 10:00 → covers Wed 10:01 → Fri 09:59
 *
 * Only clients marked ready_to_schedule or waitlist are included.
 * While the window is open, a pending draft in Automations is updated as each
 * client is marked into either category.
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const TZ = 'America/Denver';
const SCHOOLS_REPLY_TO = 'schools@itsco.health';
const TEMPLATE_TYPE = 'school_ready_to_schedule_digest';
const SUPPORT_TEAM = 'School support team';
export const DIGEST_CATEGORY_READY = 'ready_to_schedule';
export const DIGEST_CATEGORY_WAITLIST = 'waitlist';

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

function normalizeDigestCategory(category) {
  const c = String(category || '').trim().toLowerCase();
  if (c === DIGEST_CATEGORY_WAITLIST || c === 'waitlisted') return DIGEST_CATEGORY_WAITLIST;
  return DIGEST_CATEGORY_READY;
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

async function resolveDigestSender({ agencyId } = {}) {
  const aid = Number(agencyId || 0) || null;
  const notificationsEmail = 'notifications@itsco.health';
  let fromIdentity = null;
  if (aid) {
    fromIdentity = await resolvePreferredSenderIdentityForAgency({
      agencyId: aid,
      preferredKeys: ['school_intake', 'notifications', 'intake', 'system'],
      includePlatformDefaults: false,
      onlyActive: true
    });
    if (fromIdentity) {
      const fe = String(fromIdentity.from_email || '').trim().toLowerCase();
      if (fe !== notificationsEmail) {
        const list = await EmailSenderIdentity.list({
          agencyId: aid,
          includePlatformDefaults: false,
          onlyActive: true
        });
        fromIdentity = (list || []).find(
          (row) => String(row?.from_email || '').trim().toLowerCase() === notificationsEmail
        ) || fromIdentity;
      }
    }
  }
  if (!Number(fromIdentity?.id || 0)) return null;

  const hasSig = !!(
    String(fromIdentity.signature_image_path || '').trim()
    || String(fromIdentity.signature_image_url || '').trim()
  );
  let signatureIdentityId = null;
  if (!hasSig && aid) {
    const list = await EmailSenderIdentity.list({
      agencyId: aid,
      includePlatformDefaults: false,
      onlyActive: true
    });
    const schools = (list || []).find((row) =>
      String(row?.identity_key || '').trim().toLowerCase() === 'schools'
      || String(row?.from_email || '').trim().toLowerCase() === 'schools@itsco.health'
    );
    signatureIdentityId = Number(schools?.id || 0) || null;
    if (signatureIdentityId === Number(fromIdentity.id)) signatureIdentityId = null;
  }
  return {
    senderIdentityId: Number(fromIdentity.id),
    signatureIdentityId
  };
}

function formatClientBullet(it) {
  const initials = String(it.client_initials || '').trim();
  const label = String(it.client_label || '').trim();
  const reason = String(it.waitlist_reason || '').trim();
  const isWaitlist = normalizeDigestCategory(it.item_category) === DIGEST_CATEGORY_WAITLIST;
  const cleared = Number(it.cleared_from_waitlist || 0) === 1;
  const assignment = String(it.assignment_summary || '').trim()
    || formatAssignmentSummary([
      { providerName: it.provider_name, serviceDay: it.service_day }
    ].filter((a) => a.providerName || a.serviceDay));
  const movedAt = formatStatusDate(it.marked_ready_at);

  let base = null;
  if (initials && label && !label.includes(initials)) base = `${initials} — ${label}`;
  else if (initials) base = initials;
  else if (label) base = label;
  else base = `Client #${it.client_id}`;

  const details = [];
  if (isWaitlist) {
    if (assignment) {
      details.push(assignment);
      details.push('Waitlisted until the waitlist clears; if a day is listed, typically until a slot opens on that day');
    }
    if (reason) details.push(`Reason: ${reason}`);
  } else {
    if (cleared) details.push('Removed from the waitlist');
    if (assignment) details.push(assignment);
  }

  const main = details.length ? `• ${base} — ${details.join(' · ')}` : `• ${base}`;
  if (!movedAt) return { main, meta: null };
  const metaLabel = isWaitlist ? 'Moved to waitlist' : 'Moved to Ready for Schedule';
  return { main, meta: `${metaLabel}: ${movedAt}` };
}

function formatAssignmentSummary(assignments = []) {
  const parts = (assignments || [])
    .map((a) => {
      const name = String(a.providerName || '').trim();
      const day = String(a.serviceDay || '').trim();
      if (name && day) return `${name} · ${day}`;
      if (name) return name;
      if (day) return `Day: ${day}`;
      return null;
    })
    .filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

function formatStatusDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
}

const DIGEST_DISCLAIMERS = [
  'This is a digest/summary email sent three days a week (Monday, Wednesday, and Friday). It is not a real-time alert for every status change.',
  '“Ready for Schedule” refers to soft scheduling in the app. Scheduling may be done by any staff member, including the assigned provider. It is not a requirement that soft scheduling be used if you already communicate with the provider or assign/schedule the client another way.'
];

/**
 * Load active provider + weekday assignments for digest lines.
 */
export async function loadClientAssignmentSnapshot(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) {
    return { providerName: null, serviceDay: null, assignmentSummary: null };
  }
  const [rows] = await pool.execute(
    `SELECT cpa.service_day,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS provider_name
     FROM client_provider_assignments cpa
     LEFT JOIN users u ON u.id = cpa.provider_user_id
     WHERE cpa.client_id = ?
       AND cpa.is_active = TRUE
     ORDER BY
       FIELD(cpa.service_day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'),
       cpa.id ASC`,
    [cid]
  );
  const assignments = (rows || []).map((r) => ({
    providerName: String(r.provider_name || '').trim() || null,
    serviceDay: (() => {
      const day = String(r.service_day || '').trim();
      if (!day || day.toLowerCase() === 'unknown') return null;
      if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day)) return null;
      return day;
    })()
  })).filter((a) => a.providerName || a.serviceDay);

  if (!assignments.length) {
    return { providerName: null, serviceDay: null, assignmentSummary: null };
  }

  const names = [...new Set(assignments.map((a) => a.providerName).filter(Boolean))];
  const days = [...new Set(assignments.map((a) => a.serviceDay).filter(Boolean))];
  return {
    providerName: names.length ? names.join(', ').slice(0, 255) : null,
    serviceDay: days.length ? days.join(', ').slice(0, 64) : null,
    assignmentSummary: formatAssignmentSummary(assignments)?.slice(0, 500) || null
  };
}

export function buildDigestCopy({ schoolName, items }) {
  const list = (items || []).filter(Boolean);
  const readyItems = list.filter((it) => normalizeDigestCategory(it.item_category) === DIGEST_CATEGORY_READY);
  const waitlistItems = list.filter((it) => normalizeDigestCategory(it.item_category) === DIGEST_CATEGORY_WAITLIST);
  const readyCount = readyItems.length;
  const waitlistCount = waitlistItems.length;
  const count = readyCount + waitlistCount;

  let subject;
  if (readyCount && waitlistCount) subject = `${schoolName} - Ready to Schedule & Waitlist`;
  else if (waitlistCount) subject = `${schoolName} - Waitlist`;
  else subject = `${schoolName} - Ready to Schedule`;

  const readyVerb = readyCount === 1
    ? 'The following client is ready for soft scheduling:'
    : 'The following clients are ready for soft scheduling:';
  const waitVerb = waitlistCount === 1
    ? 'The following client is on the waitlist:'
    : 'The following clients are on the waitlist:';

  const readyBullets = readyItems.map(formatClientBullet);
  const waitBullets = waitlistItems.map(formatClientBullet);

  const textParts = [
    'Hello,',
    '',
    'This is your Mon/Wed/Fri school status digest.'
  ];
  if (readyCount) {
    textParts.push('', readyVerb, '');
    for (const b of readyBullets) {
      textParts.push(b.main);
      if (b.meta) textParts.push(`  ${b.meta}`);
    }
  }
  if (waitlistCount) {
    textParts.push('', waitVerb, '');
    for (const b of waitBullets) {
      textParts.push(b.main);
      if (b.meta) textParts.push(`  ${b.meta}`);
    }
  }
  textParts.push(
    '',
    'Please log in to the school portal to review status and coordinate next steps.',
    '',
    ...DIGEST_DISCLAIMERS.map((d) => `Note: ${d}`),
    '',
    'Thank you,',
    '',
    SUPPORT_TEAM,
    '',
    'Questions? Reply to this email or contact schools@ITSCO.health.'
  );
  const text = textParts.join('\n');

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const sectionHtml = (title, bullets) => {
    if (!bullets.length) return '';
    return `
      <p><strong>${esc(title)}</strong></p>
      <ul style="padding-left:18px;">
        ${bullets.map((b) => `
          <li style="margin-bottom:10px;">
            <div>${esc(b.main.replace(/^•\s*/, ''))}</div>
            ${b.meta ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(b.meta)}</div>` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  };

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 640px;">
      <p>Hello,</p>
      <p>This is your Mon/Wed/Fri school status digest.</p>
      ${sectionHtml(readyVerb, readyBullets)}
      ${sectionHtml(waitVerb, waitBullets)}
      <p>Please log in to the school portal to review status and coordinate next steps.</p>
      <div style="margin:16px 0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
        ${DIGEST_DISCLAIMERS.map((d) => `<p style="margin:0 0 8px;font-size:12px;color:#475569;">${esc(d)}</p>`).join('')}
      </div>
      <p>Thank you,</p>
      <p style="margin-top: 12px;"><strong>${esc(SUPPORT_TEAM)}</strong></p>
      <p style="font-size:12px;color:#666;">Questions? Reply to this email or contact <a href="mailto:schools@ITSCO.health">schools@ITSCO.health</a>.</p>
    </div>
  `.trim();

  return { subject, text, html, count, readyCount, waitlistCount };
}

async function loadWindowItems({ schoolOrganizationId, windowKey }) {
  const [rows] = await pool.execute(
    `SELECT id, client_id, client_initials, client_label, item_category, waitlist_reason,
            provider_name, service_day, assignment_summary, cleared_from_waitlist,
            marked_ready_at, digest_communication_id
     FROM school_ready_schedule_digest_items
     WHERE school_organization_id = ?
       AND window_key = ?
       AND item_category IN (?, ?)
     ORDER BY
       CASE WHEN item_category = ? THEN 0 ELSE 1 END,
       marked_ready_at ASC,
       id ASC`,
    [
      schoolOrganizationId,
      windowKey,
      DIGEST_CATEGORY_READY,
      DIGEST_CATEGORY_WAITLIST,
      DIGEST_CATEGORY_READY
    ]
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
  const { subject, text, html, count, readyCount, waitlistCount } = buildDigestCopy({ schoolName, items });
  if (!count) return null;

  const existingCommId = Number(items.find((i) => i.digest_communication_id)?.digest_communication_id || 0) || null;
  let commId = existingCommId;
  const draftNote = `Draft digest — sends ${windowKey} (~10:00 MT). ${readyCount} ready, ${waitlistCount} waitlist.`;

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
        draftNote,
        JSON.stringify({
          templateType: TEMPLATE_TYPE,
          windowKey,
          schoolOrganizationId,
          clientIds: items.map((i) => i.client_id),
          readyCount,
          waitlistCount,
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
        readyCount,
        waitlistCount,
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
        [draftNote, commId]
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

  return { commId, subject, text, html, to, schoolName, count, readyCount, waitlistCount };
}

/**
 * Record a client marked Ready to Schedule or Waitlist into the next digest window + refresh draft.
 * Only these two categories are emailed.
 */
export async function enqueueReadyToScheduleDigest({
  agencyId,
  schoolOrganizationId,
  clientId,
  clientInitials = null,
  clientLabel = null,
  category = DIGEST_CATEGORY_READY,
  waitlistReason = null,
  clearedFromWaitlist = false,
  statusChangedAt = null
}) {
  const aid = Number(agencyId || 0);
  const sid = Number(schoolOrganizationId || 0);
  const cid = Number(clientId || 0);
  if (!aid || !sid || !cid) return null;

  const itemCategory = normalizeDigestCategory(category);
  const { windowKey } = getReadyScheduleDigestWindow(new Date());
  const reason = itemCategory === DIGEST_CATEGORY_WAITLIST
    ? (waitlistReason ? String(waitlistReason).slice(0, 500) : null)
    : null;
  const cleared = itemCategory === DIGEST_CATEGORY_READY && clearedFromWaitlist === true ? 1 : 0;
  const assignment = await loadClientAssignmentSnapshot(cid);
  const markedAt = statusChangedAt
    ? (statusChangedAt instanceof Date ? statusChangedAt : new Date(statusChangedAt))
    : new Date();
  const markedAtSql = Number.isNaN(markedAt.getTime())
    ? new Date()
    : markedAt;

  await pool.execute(
    `INSERT INTO school_ready_schedule_digest_items
       (agency_id, school_organization_id, client_id, client_initials, client_label,
        item_category, waitlist_reason, provider_name, service_day, assignment_summary,
        cleared_from_waitlist, window_key, marked_ready_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       client_initials = COALESCE(VALUES(client_initials), client_initials),
       client_label = COALESCE(VALUES(client_label), client_label),
       waitlist_reason = VALUES(waitlist_reason),
       provider_name = VALUES(provider_name),
       service_day = VALUES(service_day),
       assignment_summary = VALUES(assignment_summary),
       cleared_from_waitlist = VALUES(cleared_from_waitlist),
       marked_ready_at = IF(
         item_category <> VALUES(item_category),
         VALUES(marked_ready_at),
         marked_ready_at
       ),
       item_category = VALUES(item_category)`,
    [
      aid,
      sid,
      cid,
      clientInitials ? String(clientInitials).slice(0, 32) : null,
      clientLabel ? String(clientLabel).slice(0, 255) : null,
      itemCategory,
      reason,
      assignment.providerName,
      assignment.serviceDay,
      assignment.assignmentSummary,
      cleared,
      windowKey,
      markedAtSql
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

/** Alias for waitlist enqueue — same Mon/Wed/Fri digest, Waitlist section. */
export async function enqueueWaitlistDigest(params = {}) {
  return enqueueReadyToScheduleDigest({
    ...params,
    category: DIGEST_CATEGORY_WAITLIST
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

  const sender = await resolveDigestSender({ agencyId });
  if (!sender?.senderIdentityId) {
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

  const fromLabel = draft.readyCount && draft.waitlistCount
    ? `${draft.schoolName} - Ready to Schedule & Waitlist`
    : draft.waitlistCount
      ? `${draft.schoolName} - Waitlist`
      : `${draft.schoolName} - Ready to Schedule`;

  const result = await sendEmailFromIdentity({
    senderIdentityId: sender.senderIdentityId,
    to: draft.to,
    subject: draft.subject,
    text: `${draft.text}\n\nPortal: ${portalUrl}`,
    html: draft.html,
    source: 'auto',
    agencyId,
    templateType: TEMPLATE_TYPE,
    fromDisplayNameOverride: fromLabel,
    replyToOverride: SCHOOLS_REPLY_TO,
    signatureIdentityId: sender.signatureIdentityId,
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
     WHERE window_key = ?
       AND item_category IN (?, ?)`,
    [windowKey, DIGEST_CATEGORY_READY, DIGEST_CATEGORY_WAITLIST]
  );

  const results = [];
  for (const g of groups || []) {
    try {
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
  enqueueWaitlistDigest,
  runReadyToScheduleDigestTick,
  buildDigestCopy,
  loadClientAssignmentSnapshot,
  DIGEST_CATEGORY_READY,
  DIGEST_CATEGORY_WAITLIST
};
