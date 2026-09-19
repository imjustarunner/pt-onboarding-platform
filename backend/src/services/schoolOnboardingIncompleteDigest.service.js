/**
 * Incomplete school-onboarding digest for tenant ops.
 *
 * ITSCO only (for now): emails Rachel Finch a summary of schools that started
 * portal onboarding but have not submitted, with % complete + admin deep links.
 *
 * Send windows (America/Denver): Monday / Wednesday / Friday at 10:00–10:14.
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import SchoolOnboardingInvite from '../models/SchoolOnboardingInvite.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { STEP_KEYS } from './schoolOnboarding.service.js';

const TZ = 'America/Denver';
const TEMPLATE_TYPE = 'school_onboarding_incomplete_digest';
const ITSCO_SLUG = 'itsco';
const ITSCO_RECIPIENT = 'rachel@itsco.health';
const ITSCO_PRIMARY = '#669878';
const ITSCO_ACCENT = '#145A3D';

const STEP_LABELS = {
  school_information: 'School information',
  school_staff: 'School staff',
  preferred_days: 'Preferred days',
  welcome_materials: 'Welcome materials',
  explore_demo: 'Explore demo',
  review_submit: 'Review & submit'
};

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

export function getIncompleteOnboardingDigestWindow(now = new Date()) {
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
export function isIncompleteOnboardingDigestSendSlot(now = new Date()) {
  const p = denverParts(now);
  if (![1, 3, 5].includes(p.weekday)) return false;
  return p.hour === 10 && p.minute < 15;
}

function currentWindowKey(now = new Date()) {
  const p = denverParts(now);
  const slotLabel = p.weekday === 1 ? 'mon' : p.weekday === 3 ? 'wed' : p.weekday === 5 ? 'fri' : null;
  if (!slotLabel) return null;
  return `${ymd(p.year, p.month, p.day)}_${slotLabel}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseProgress(raw) {
  const base = SchoolOnboardingInvite.defaultStepProgress();
  if (!raw) return base;
  if (typeof raw === 'object') return { ...base, ...raw };
  try {
    return { ...base, ...(JSON.parse(raw) || {}) };
  } catch {
    return base;
  }
}

function completedCount(progress) {
  return STEP_KEYS.filter((k) => progress?.[k] === 'complete').length;
}

function inviteHasStarted(invite, progress) {
  if (invite?.recipient_started_at) return true;
  if (invite?.password_set_at) return true;
  if (String(invite?.status || '').toLowerCase() === 'in_progress') return true;
  if (completedCount(progress) > 0) return true;
  if (STEP_KEYS.some((k) => progress?.[k] === 'in_progress')) return true;
  if (invite?.last_viewed_at) return true;
  return false;
}

function percentComplete(completed, total) {
  const t = Math.max(1, Number(total) || STEP_KEYS.length);
  const c = Math.max(0, Number(completed) || 0);
  return Math.round((c / t) * 100);
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

async function resolveItscoAgency() {
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, website_url, custom_domain, color_palette, logo_url, logo_path
     FROM agencies
     WHERE (slug = ? OR portal_url = ?) AND organization_type = 'agency'
     LIMIT 1`,
    [ITSCO_SLUG, ITSCO_SLUG]
  );
  return rows?.[0] || (await Agency.findById(2));
}

/**
 * Open ITSCO invites that have started onboarding but are not submitted/revoked.
 */
export async function listIncompleteStartedInvitesForAgency(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT i.*,
            s.name AS school_org_name, s.slug AS school_slug, s.portal_url AS school_portal_url
     FROM school_onboarding_invites i
     JOIN agencies s ON s.id = i.school_organization_id
     WHERE i.agency_id = ?
       AND LOWER(COALESCE(i.status, '')) NOT IN ('submitted', 'revoked')
       AND (i.expires_at IS NULL OR i.expires_at > NOW())
     ORDER BY i.updated_at DESC, i.id DESC`,
    [aid]
  );

  const out = [];
  for (const row of rows || []) {
    const invite = SchoolOnboardingInvite.normalizeRow(row);
    const progress = parseProgress(invite.step_progress);
    if (!inviteHasStarted(invite, progress)) continue;
    const completed = completedCount(progress);
    const total = STEP_KEYS.length;
    const pct = percentComplete(completed, total);
    const incompleteSteps = STEP_KEYS.filter((k) => progress?.[k] !== 'complete').map(
      (k) => STEP_LABELS[k] || k
    );
    out.push({
      inviteId: Number(invite.id),
      schoolName: String(invite.school_name || invite.school_org_name || 'School').trim() || 'School',
      schoolSlug: invite.school_slug || invite.school_portal_url || null,
      contactName: `${invite.contact_first_name || ''} ${invite.contact_last_name || ''}`.trim() || '—',
      contactEmail: String(invite.contact_email || '').trim().toLowerCase() || null,
      status: String(invite.status || '').toLowerCase(),
      completedSteps: completed,
      totalSteps: total,
      percentComplete: pct,
      incompleteSteps,
      lastViewedAt: invite.last_viewed_at || null,
      passwordSetAt: invite.password_set_at || null,
      recipientStartedAt: invite.recipient_started_at || null,
      updatedAt: invite.updated_at || null,
      token: invite.token || null
    });
  }

  out.sort((a, b) => a.percentComplete - b.percentComplete || a.schoolName.localeCompare(b.schoolName));
  return out;
}

function buildAdminOverviewUrl(agency) {
  const slug = String(agency?.portal_url || agency?.slug || ITSCO_SLUG).trim().toLowerCase();
  return buildPublicAppUrl(
    { ...agency, slug, portal_url: slug, organization_type: 'agency' },
    `${slug}/admin/school-onboarding`
  );
}

function buildAdminInviteUrl(agency, inviteId) {
  const base = buildAdminOverviewUrl(agency);
  if (!base) return null;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}inviteId=${encodeURIComponent(String(inviteId))}`;
}

function buildDigestBodies({ agency, schools, overviewUrl, sendLabel }) {
  const agencyName = agency?.name || 'ITSCO';
  const count = schools.length;
  const subject =
    count === 0
      ? `${agencyName}: no incomplete school onboarding (${sendLabel})`
      : `${agencyName}: ${count} school${count === 1 ? '' : 's'} still completing onboarding`;

  const lines = [
    `Hi Rachel,`,
    ``,
    count === 0
      ? `Good news — no ITSCO schools currently have incomplete school portal onboarding that has been started.`
      : `Here is the ${sendLabel} status of ITSCO schools that started portal onboarding but have not finished yet.`,
    ``
  ];

  for (const s of schools) {
    lines.push(
      `${s.schoolName} — ${s.percentComplete}% complete (${s.completedSteps}/${s.totalSteps} steps)`,
      `  Contact: ${s.contactName}${s.contactEmail ? ` <${s.contactEmail}>` : ''}`,
      `  Remaining: ${s.incompleteSteps.join(', ') || '—'}`,
      `  Last activity: ${formatDateTime(s.updatedAt || s.lastViewedAt)}`,
      `  Open in admin: ${s.adminUrl}`,
      ``
    );
  }

  if (overviewUrl) {
    lines.push(`Open school onboarding admin:`, overviewUrl, ``);
  }
  lines.push(`This digest is ITSCO-only and sends Mondays, Wednesdays, and Fridays.`);

  const text = lines.join('\n');

  const rowsHtml = schools
    .map((s) => {
      const barWidth = Math.max(4, Math.min(100, s.percentComplete));
      return `
      <tr>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:700;color:#0f172a;font-size:15px;">${escapeHtml(s.schoolName)}</div>
          <div style="margin-top:4px;color:#64748b;font-size:13px;">
            ${escapeHtml(s.contactName)}${s.contactEmail ? ` · ${escapeHtml(s.contactEmail)}` : ''}
          </div>
          <div style="margin-top:8px;background:#e8f0eb;border-radius:999px;height:10px;overflow:hidden;">
            <div style="width:${barWidth}%;height:10px;background:${ITSCO_PRIMARY};border-radius:999px;"></div>
          </div>
          <div style="margin-top:6px;font-size:13px;color:${ITSCO_ACCENT};font-weight:700;">
            ${s.percentComplete}% complete · ${s.completedSteps}/${s.totalSteps} steps
          </div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;">
            Remaining: ${escapeHtml(s.incompleteSteps.join(', ') || '—')}
          </div>
          <div style="margin-top:4px;font-size:12px;color:#94a3b8;">
            Last activity: ${escapeHtml(formatDateTime(s.updatedAt || s.lastViewedAt))}
          </div>
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;vertical-align:middle;text-align:right;white-space:nowrap;">
          <a href="${escapeHtml(s.adminUrl)}"
             style="display:inline-block;background:${ITSCO_PRIMARY};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 14px;border-radius:8px;">
            Open onboarding
          </a>
        </td>
      </tr>`;
    })
    .join('');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.45;">
    <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:${ITSCO_ACCENT};">School onboarding progress</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;">
      ${
        count === 0
          ? 'No ITSCO schools currently have incomplete portal onboarding that has been started.'
          : `${escapeHtml(String(count))} ITSCO school${count === 1 ? '' : 's'} started onboarding and ${count === 1 ? 'has' : 'have'} not finished yet (${escapeHtml(sendLabel)} digest).`
      }
    </p>
    ${
      count
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            ${rowsHtml}
          </table>`
        : ''
    }
    ${
      overviewUrl
        ? `<p style="margin:18px 0 0;">
            <a href="${escapeHtml(overviewUrl)}"
               style="color:${ITSCO_ACCENT};font-weight:700;font-size:14px;">
              Open school onboarding admin →
            </a>
          </p>`
        : ''
    }
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">
      ITSCO-only digest · Mondays, Wednesdays &amp; Fridays · America/Denver
    </p>
  </div>`;

  return { subject, text, html };
}

async function resolveSender(agencyId) {
  return resolvePreferredSenderIdentityForAgency({
    agencyId,
    preferredKeys: ['notifications', 'system', 'schools', 'school_intake', 'default'],
    includePlatformDefaults: false,
    onlyActive: true
  });
}

async function alreadySent({ agencyId, windowKey, recipientEmail }) {
  const [rows] = await pool
    .execute(
      `SELECT id FROM school_onboarding_incomplete_digest_sends
       WHERE agency_id = ? AND window_key = ? AND recipient_email = ?
       LIMIT 1`,
      [agencyId, windowKey, recipientEmail]
    )
    .catch((e) => {
      if (e?.code === 'ER_NO_SUCH_TABLE') return [[]];
      throw e;
    });
  return !!rows?.[0];
}

async function recordSend({ agencyId, windowKey, recipientEmail, inviteCount, communicationId }) {
  await pool
    .execute(
      `INSERT INTO school_onboarding_incomplete_digest_sends
        (agency_id, window_key, recipient_email, invite_count, communication_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         invite_count = VALUES(invite_count),
         communication_id = COALESCE(VALUES(communication_id), communication_id),
         sent_at = CURRENT_TIMESTAMP`,
      [agencyId, windowKey, recipientEmail, inviteCount, communicationId || null]
    )
    .catch((e) => {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        console.warn(
          '[so-incomplete-digest] send log table missing — run migration 1468_school_onboarding_incomplete_digest.sql'
        );
        return null;
      }
      throw e;
    });
}

/**
 * Send the incomplete-onboarding digest for ITSCO → Rachel Finch.
 * @param {{ force?: boolean, now?: Date, windowKey?: string }} [opts]
 */
export async function sendIncompleteOnboardingDigestNow(opts = {}) {
  const force = opts.force === true;
  const now = opts.now || new Date();
  const agency = await resolveItscoAgency();
  if (!agency?.id) {
    return { sent: false, reason: 'itsco_agency_not_found' };
  }

  const agencyId = Number(agency.id);
  const p = denverParts(now);
  const slotLabel = [1, 3, 5].includes(p.weekday)
    ? p.weekday === 1
      ? 'mon'
      : p.weekday === 3
        ? 'wed'
        : 'fri'
    : 'adhoc';
  const windowKey =
    opts.windowKey ||
    (force && !isIncompleteOnboardingDigestSendSlot(now)
      ? `${ymd(p.year, p.month, p.day)}_${slotLabel}_manual`
      : currentWindowKey(now) || `${ymd(p.year, p.month, p.day)}_manual`);
  const sendLabel =
    slotLabel === 'mon'
      ? 'Monday'
      : slotLabel === 'wed'
        ? 'Wednesday'
        : slotLabel === 'fri'
          ? 'Friday'
          : 'manual';

  const recipient = ITSCO_RECIPIENT;
  if (!force && (await alreadySent({ agencyId, windowKey, recipientEmail: recipient }))) {
    return { sent: false, reason: 'already_sent', windowKey };
  }

  const schoolsRaw = await listIncompleteStartedInvitesForAgency(agencyId);
  const overviewUrl = buildAdminOverviewUrl(agency);
  const schools = schoolsRaw.map((s) => ({
    ...s,
    adminUrl: buildAdminInviteUrl(agency, s.inviteId) || overviewUrl
  }));

  const { subject, text, html } = buildDigestBodies({
    agency,
    schools,
    overviewUrl,
    sendLabel: force && !isIncompleteOnboardingDigestSendSlot(now) ? 'manual' : sendLabel
  });

  const identity = await resolveSender(agencyId);
  if (!identity?.id) {
    return { sent: false, reason: 'no_sender_identity', windowKey, inviteCount: schools.length };
  }

  const result = await sendEmailFromIdentity({
    senderIdentityId: Number(identity.id),
    to: recipient,
    subject,
    text,
    html,
    source: 'auto',
    agencyId,
    templateType: TEMPLATE_TYPE,
    fromDisplayNameOverride: `${agency.name || 'ITSCO'} School Onboarding`,
    linkUrl: overviewUrl || null
  });

  if (result?.skipped || result?.blocked) {
    return {
      sent: false,
      reason: result.reason || 'skipped',
      windowKey,
      inviteCount: schools.length,
      communicationId: result?.communicationId || null
    };
  }

  await recordSend({
    agencyId,
    windowKey,
    recipientEmail: recipient,
    inviteCount: schools.length,
    communicationId: result?.communicationId || null
  });

  return {
    sent: true,
    windowKey,
    inviteCount: schools.length,
    recipient,
    communicationId: result?.communicationId || null,
    schools: schools.map((s) => ({
      inviteId: s.inviteId,
      schoolName: s.schoolName,
      percentComplete: s.percentComplete
    }))
  };
}

/**
 * Scheduler tick: Mon/Wed/Fri 10:00–10:14 America/Denver.
 */
export async function runIncompleteOnboardingDigestTick(now = new Date()) {
  if (!isIncompleteOnboardingDigestSendSlot(now)) {
    return { ran: false, reason: 'outside_send_slot' };
  }
  const windowKey = currentWindowKey(now);
  if (!windowKey) return { ran: false, reason: 'no_window' };
  const result = await sendIncompleteOnboardingDigestNow({ now, windowKey, force: false });
  return { ran: true, ...result };
}
