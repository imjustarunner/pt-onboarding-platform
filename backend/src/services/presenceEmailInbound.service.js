/**
 * Presence Time inbound email handler (time@plottwistco.com).
 * Parses natural-language status / planned-out requests from Presence Board staff
 * and applies them (same-day planned outs auto-approved).
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserPresenceStatus from '../models/UserPresenceStatus.model.js';
import PlannedOut from '../models/PlannedOut.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import GoogleWorkspaceEmailService from './googleWorkspaceEmail.service.js';

const PRESENCE_BOARD_ROLES = new Set(['staff', 'admin', 'super_admin', 'support']);
const DEFAULT_END_HOUR = 17; // 5pm local wall clock (agency TZ when known)

const CLARIFICATION_HELP = [
  'I could not tell what to set. Reply with one of these:',
  '',
  'AVAILABLE (logged out — blue / available while offline)',
  '  Available logged out, reason: Errands, reachable call/text',
  '  Status available, reachable call',
  '  Available offline, reachable text, reason: Working from phone',
  '',
  'UNAVAILABLE (red — out for the day)',
  '  Unavailable',
  '  Out for the day',
  '  Mark me unavailable',
  '',
  'PLANNED OUT (today only — no approval needed for same-day email)',
  '  Planned out, rest of day',
  '  Out rest of day',
  '  Planned out 2pm to 5pm, available, call/text, details: dentist',
  '  Out 1pm-3pm, unavailable',
  '',
  'Tips: include times (e.g. 2pm-5pm), whether you are available, and call / text / email if reachable.'
].join('\n');

function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripQuotedReply(body) {
  const lines = String(body || '').split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    if (/^>+/.test(line.trim())) break;
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim()) && kept.length > 0) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

function parseHourMinute(token) {
  const t = String(token || '').trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = (m[3] || '').toLowerCase();
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour <= 7) hour += 12; // bare "2" / "2:30" → afternoon default
  return { hour, min };
}

function extractTimeRange(text) {
  const s = String(text || '');
  // 2pm to 5pm | 2:00-5:00 | 14:00–17:00
  const range = s.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
  );
  if (range) {
    const start = parseHourMinute(range[1]);
    const end = parseHourMinute(range[2]);
    if (start && end) return { start, end, restOfDay: false };
  }
  return null;
}

function isRestOfDay(text) {
  const s = String(text || '').toLowerCase();
  return (
    /\brest\s+of\s+(the\s+)?day\b/.test(s) ||
    /\brest\s+of\s+today\b/.test(s) ||
    /\buntil\s+(end\s+of\s+)?(the\s+)?day\b/.test(s) ||
    /\bthrough\s+(the\s+)?(end\s+of\s+)?(the\s+)?day\b/.test(s)
  );
}

function extractReachable(text) {
  const s = String(text || '').toLowerCase();
  const wantsCall =
    /\b(call|phone|reachable\s+call|available\s+for\s+call|via\s+call)\b/.test(s) &&
    !/\bno\s+call\b/.test(s);
  const wantsText =
    /\b(text|sms|reachable\s+text|available\s+for\s+text|via\s+text)\b/.test(s) &&
    !/\bno\s+text\b/.test(s);
  const wantsEmail =
    /\b(email|e-mail|reachable\s+email|via\s+email)\b/.test(s) &&
    !/\bno\s+email\b/.test(s);

  if (/\bcall\s*[\/&+]\s*text\b/.test(s) || /\btext\s*[\/&+]\s*call\b/.test(s)) {
    return { presence: 'call_text', planned: 'call_text', wantsEmail };
  }
  if (wantsCall && wantsText) return { presence: 'call_text', planned: 'call_text', wantsEmail };
  if (wantsCall && wantsEmail) return { presence: 'call', planned: 'call_email', wantsEmail };
  if (wantsText && wantsEmail) return { presence: 'text', planned: 'text_email', wantsEmail };
  if (wantsCall) return { presence: 'call', planned: 'call_only', wantsEmail };
  if (wantsText) return { presence: 'text', planned: 'text_only', wantsEmail };
  if (wantsEmail) return { presence: null, planned: 'email_only', wantsEmail };
  return { presence: null, planned: 'none', wantsEmail: false };
}

function extractCustomReason(text) {
  const s = String(text || '');
  const m =
    s.match(/\breason\s*[:\-–—]\s*(.+?)(?=\s*,\s*(?:reachable|call|text|email|sms)\b|\.|$)/i) ||
    s.match(/\bdetails?\s*[:\-–—]\s*(.+?)(?=\s*,\s*(?:reachable|call|text|email|sms)\b|\.|$)/i) ||
    s.match(/\bnote\s*[:\-–—]\s*(.+?)(?=\s*,\s*(?:reachable|call|text|email|sms)\b|\.|$)/i);
  if (m) return String(m[1] || '').trim().slice(0, 120);
  return null;
}

function extractDetails(text) {
  const s = String(text || '');
  const m = s.match(/\bdetails?\s*[:\-–—]\s*(.+)$/i);
  if (m) return String(m[1] || '').trim().slice(0, 500);
  return null;
}

function detectIntent(text) {
  const s = String(text || '').toLowerCase();

  // Available logged out (blue) — before any bare "out" matching
  if (
    /\bavailable\s+(logged\s+)?out\b/.test(s) ||
    /\bavailable\s+offline\b/.test(s) ||
    /\blogged\s+out\b/.test(s) ||
    /\bstatus\s+available\b/.test(s) ||
    /\bmark\s+me\s+(as\s+)?available\b/.test(s) ||
    (/\bavailable\b/.test(s) && /\breachable\b/.test(s))
  ) {
    return 'available_offline';
  }

  const bareOut =
    /\b(i'?m\s+)?out\b/.test(s) &&
    !/\blogged\s+out\b/.test(s) &&
    !/\bavailable\s+out\b/.test(s);

  // Planned out when an out/time cue is present (may also say "unavailable")
  if (
    /\bplanned\s+out\b/.test(s) ||
    /\bout\s+rest\s+of\b/.test(s) ||
    (bareOut && (isRestOfDay(s) || extractTimeRange(s))) ||
    (bareOut && !/\bout\s+for\s+the\s+day\b/.test(s)) ||
    (isRestOfDay(s) && !/\bunavailable\b/.test(s) && !bareOut)
  ) {
    return 'planned_out';
  }

  // Unavailable (red) — "out for the day" / bare unavailable
  if (
    /\bunavailable\b/.test(s) ||
    /\bout\s+for\s+the\s+day\b/.test(s) ||
    /\bmark\s+me\s+(as\s+)?unavailable\b/.test(s)
  ) {
    return 'unavailable';
  }

  if (/\bavailable\b/.test(s) && !/\bunavailable\b/.test(s)) {
    return 'available_offline';
  }

  return null;
}

function plannedAvailability(text) {
  const s = String(text || '').toLowerCase();
  if (/\bunavailable\b/.test(s)) return 'unavailable';
  if (/\bavailable\b/.test(s) && !/\bunavailable\b/.test(s)) return 'available';
  return 'unavailable';
}

function localDateParts(date = new Date(), timeZone = 'America/Denver') {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return {
      y: Number(parts.year),
      m: Number(parts.month),
      d: Number(parts.day),
      hour: Number(parts.hour) % 24,
      min: Number(parts.minute)
    };
  } catch {
    return {
      y: date.getFullYear(),
      m: date.getMonth() + 1,
      d: date.getDate(),
      hour: date.getHours(),
      min: date.getMinutes()
    };
  }
}

/** Wall clock in TZ → UTC Date */
function wallToUtcDate({ y, m, d, hour, min }, timeZone = 'America/Denver') {
  // Iteratively find UTC instant whose wall time in TZ matches (handles DST).
  let guess = Date.UTC(y, m - 1, d, hour, min, 0);
  for (let i = 0; i < 3; i++) {
    const parts = localDateParts(new Date(guess), timeZone);
    const want = Date.UTC(y, m - 1, d, hour, min, 0);
    const got = Date.UTC(parts.y, parts.m - 1, parts.d, parts.hour, parts.min, 0);
    guess += want - got;
  }
  return new Date(guess);
}

function toMysqlUtc(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function parsePresenceEmailIntent({ subject = '', body = '' } = {}) {
  const cleaned = stripQuotedReply(body);
  const combined = normalizeText(`${subject}\n${cleaned}`);
  if (!combined) {
    return { ok: false, needsClarification: true, intent: null, message: CLARIFICATION_HELP };
  }

  const intent = detectIntent(combined);
  if (!intent) {
    return { ok: false, needsClarification: true, intent: null, message: CLARIFICATION_HELP };
  }

  const reachable = extractReachable(combined);
  const reason = extractCustomReason(combined);
  const details = extractDetails(combined) || reason;

  if (intent === 'available_offline') {
    return {
      ok: true,
      intent: 'available_offline',
      customLabel: reason || details || null,
      reachable: reachable.presence,
      details: details || null
    };
  }

  if (intent === 'unavailable') {
    return {
      ok: true,
      intent: 'unavailable',
      details: details || reason || null
    };
  }

  // planned_out — bare "I'm out" / "out" / "rest of day" → now through 5pm
  const range = extractTimeRange(combined);
  const restOfDay = !range;

  let contactPreference = reachable.planned || 'none';
  if (reachable.wantsEmail && reachable.presence === 'call_text') contactPreference = 'call_text_email';
  else if (reachable.wantsEmail && reachable.presence === 'call') contactPreference = 'call_email';
  else if (reachable.wantsEmail && reachable.presence === 'text') contactPreference = 'text_email';

  return {
    ok: true,
    intent: 'planned_out',
    restOfDay,
    timeRange: range,
    availability: plannedAvailability(combined),
    contactPreference,
    details: details || reason || null
  };
}

async function resolveAgencyContext(userId) {
  const agencies = await User.getAgencies(userId);
  const list = Array.isArray(agencies) ? agencies : [];
  const agency =
    list.find((a) => String(a?.organization_type || '').toLowerCase() === 'agency') ||
    list[0] ||
    null;
  if (!agency?.id) return null;
  return {
    agencyId: Number(agency.id),
    timeZone: String(agency.timezone || agency.time_zone || '').trim() || 'America/Denver',
    agencyName: agency.name || null
  };
}

export async function applyAvailableOffline(userId, parsed) {
  await pool.execute(
    `INSERT INTO user_presence (user_id, availability_level, last_heartbeat_at, updated_at)
     VALUES (?, 'everyone', NULL, NOW())
     ON DUPLICATE KEY UPDATE
       availability_level = 'everyone',
       last_heartbeat_at = NULL,
       updated_at = NOW()`,
    [userId]
  );

  let displayLabel = 'Available · Logged out';
  if (parsed.customLabel) displayLabel = `Available · ${parsed.customLabel}`;
  if (parsed.reachable) {
    const reachLabel = UserPresenceStatus.labelForReason(parsed.reachable);
    if (reachLabel) displayLabel = `${displayLabel} · ${reachLabel}`;
  }

  await UserPresenceStatus.upsertForUser(userId, {
    status: 'in_available',
    reason: 'available_offline',
    display_label: displayLabel.slice(0, 80),
    note: parsed.reachable || parsed.customLabel || null,
    started_at: new Date(),
    ends_at: null,
    expected_return_at: null,
    session_extend_until: null
  });

  return `Got it — marked you Available · Logged out${parsed.reachable ? ` (${UserPresenceStatus.labelForReason(parsed.reachable)})` : ''}${parsed.customLabel ? `. Reason: ${parsed.customLabel}` : ''}.`;
}

export async function applyUnavailable(userId, parsed) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  await pool.execute(
    `INSERT INTO user_presence (user_id, availability_level, last_heartbeat_at, updated_at)
     VALUES (?, 'everyone', NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       availability_level = 'everyone',
       last_heartbeat_at = NOW(),
       updated_at = NOW()`,
    [userId]
  );

  await UserPresenceStatus.upsertForUser(userId, {
    status: 'out_full_day',
    reason: 'out_day',
    display_label: 'Out for the Day',
    note: parsed.details || null,
    started_at: now,
    ends_at: end,
    expected_return_at: null,
    session_extend_until: null
  });

  return `Got it — marked you Unavailable (Out for the Day)${parsed.details ? `. Note: ${parsed.details}` : ''}.`;
}

export async function applyPlannedOut(userId, parsed, agencyCtx) {
  if (!(await PlannedOut.tableExists())) {
    throw new Error('Planned outs are not available yet');
  }

  const tz = agencyCtx.timeZone;
  const now = new Date();
  const local = localDateParts(now, tz);
  const ymd = `${String(local.y).padStart(4, '0')}-${String(local.m).padStart(2, '0')}-${String(local.d).padStart(2, '0')}`;

  let startAt;
  let endAt;
  if (parsed.restOfDay) {
    startAt = now;
    endAt = wallToUtcDate({ y: local.y, m: local.m, d: local.d, hour: DEFAULT_END_HOUR, min: 0 }, tz);
    if (endAt <= startAt) {
      // Past 5pm — extend to 6pm or end of day
      endAt = wallToUtcDate({ y: local.y, m: local.m, d: local.d, hour: 23, min: 59 }, tz);
    }
  } else {
    const { start, end } = parsed.timeRange;
    startAt = wallToUtcDate({ y: local.y, m: local.m, d: local.d, hour: start.hour, min: start.min }, tz);
    endAt = wallToUtcDate({ y: local.y, m: local.m, d: local.d, hour: end.hour, min: end.min }, tz);
    if (endAt <= startAt) {
      throw Object.assign(new Error('End time must be after start time'), { needsClarification: true });
    }
  }

  const user = await User.findById(userId);
  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'Team member';
  const availability = parsed.availability || 'unavailable';
  const contactPreference = parsed.contactPreference || 'none';
  const details = parsed.details || null;

  const contactBits = {
    call_only: 'Call Only',
    email_only: 'Email Only',
    text_only: 'Text Only',
    call_text: 'Call & Text',
    call_email: 'Call & Email',
    text_email: 'Text & Email',
    call_text_email: 'Call, Text & Email',
    none: '--'
  };
  const description = [
    availability === 'available' ? 'Available' : 'Unavailable',
    '--',
    contactBits[contactPreference] || '--',
    details
  ]
    .filter(Boolean)
    .join(' | ');

  const event = await ProviderScheduleEvent.create({
    agencyId: agencyCtx.agencyId,
    providerId: userId,
    kind: 'SCHEDULE_HOLD',
    title: `${userName} — Planned out`,
    description,
    reasonCode: 'PLANNED_OUT',
    isPrivate: false,
    allDay: false,
    startAt: toMysqlUtc(startAt),
    endAt: toMysqlUtc(endAt),
    startDate: null,
    endDate: null,
    createdByUserId: userId
  });

  const created = await PlannedOut.create({
    agencyId: agencyCtx.agencyId,
    userId,
    submittedByUserId: userId,
    status: 'approved', // same-day email — no approval
    spanType: 'hours',
    halfDayPart: null,
    allDay: false,
    startAt: toMysqlUtc(startAt),
    endAt: toMysqlUtc(endAt),
    startDate: ymd,
    endDate: ymd,
    availability,
    emergencies: 'none',
    contactPreference,
    details,
    scheduleEventId: event?.id || null
  });

  // Mirror on Team Board while the window is active (if starting now / already started)
  if (startAt.getTime() <= Date.now() + 60 * 1000) {
    const boardStatus = availability === 'available' ? 'traveling_offsite' : 'out_full_day';
    const boardReason = availability === 'available' ? 'custom' : 'out_day';
    let label = availability === 'available' ? 'Planned out · available' : 'Out for planned out';
    if (contactPreference && contactPreference !== 'none') {
      label = `${label} · ${contactBits[contactPreference] || contactPreference}`;
    }
    await UserPresenceStatus.upsertForUser(userId, {
      status: boardStatus,
      reason: boardReason,
      display_label: label.slice(0, 80),
      note: details || (contactPreference !== 'none' ? contactPreference : null),
      started_at: startAt,
      ends_at: endAt,
      expected_return_at: endAt,
      session_extend_until: null
    });
  }

  const fmt = (d) => {
    try {
      return d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    } catch {
      return d.toISOString();
    }
  };

  return `Got it — planned out today ${fmt(startAt)}–${fmt(endAt)} (${availability}${contactPreference !== 'none' ? `, ${contactBits[contactPreference]}` : ''})${details ? `. Details: ${details}` : ''}. Same-day email planned outs are auto-approved.`;
}

/**
 * Handle an inbound email routed to the presence_time identity.
 * @returns {{ handled: boolean, replied?: boolean, ignored?: boolean, reason?: string }}
 */
export async function handlePresenceTimeInbound({
  fromEmail,
  subject,
  bodyText,
  senderIdentityId,
  messageIdHeader = null
} = {}) {
  const email = String(fromEmail || '').trim().toLowerCase();
  if (!email) {
    return { handled: true, ignored: true, reason: 'missing_from' };
  }

  const user = await User.findByEmail(email);
  if (!user?.id) {
    await replyFromTimeMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: [
        'I could not match your email to a PlotTwist account.',
        'Presence Time only works for people on the admin Presence Board (staff / admin / support).',
        '',
        'Send from the email on your account, or ask Technology if your address needs linking.'
      ].join('\n'),
      messageIdHeader
    });
    return { handled: true, replied: true, reason: 'unknown_sender' };
  }

  const role = String(user.role || '').toLowerCase();
  if (!PRESENCE_BOARD_ROLES.has(role)) {
    await replyFromTimeMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: [
        'Presence Time is only for people on the admin Presence Board (staff, admin, support, super_admin).',
        `Your role (${role || 'unknown'}) is not eligible.`,
        '',
        CLARIFICATION_HELP
      ].join('\n'),
      messageIdHeader
    });
    return { handled: true, replied: true, reason: 'role_not_allowed' };
  }

  const parsed = parsePresenceEmailIntent({ subject, body: bodyText });
  if (!parsed.ok || parsed.needsClarification) {
    await replyFromTimeMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: parsed.message || CLARIFICATION_HELP,
      messageIdHeader
    });
    return { handled: true, replied: true, reason: 'needs_clarification' };
  }

  try {
    let confirmation;
    if (parsed.intent === 'available_offline') {
      confirmation = await applyAvailableOffline(user.id, parsed);
    } else if (parsed.intent === 'unavailable') {
      confirmation = await applyUnavailable(user.id, parsed);
    } else if (parsed.intent === 'planned_out') {
      const agencyCtx = await resolveAgencyContext(user.id);
      if (!agencyCtx) {
        await replyFromTimeMailbox({
          senderIdentityId,
          to: email,
          subject,
          text: 'I found your account but could not determine your agency for a planned out. Ask an admin to confirm your agency membership, then try again.',
          messageIdHeader
        });
        return { handled: true, replied: true, reason: 'no_agency' };
      }
      confirmation = await applyPlannedOut(user.id, parsed, agencyCtx);
    } else {
      await replyFromTimeMailbox({
        senderIdentityId,
        to: email,
        subject,
        text: CLARIFICATION_HELP,
        messageIdHeader
      });
      return { handled: true, replied: true, reason: 'unknown_intent' };
    }

    await replyFromTimeMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: confirmation,
      messageIdHeader,
      userId: user.id
    });
    return { handled: true, replied: true, reason: 'applied', intent: parsed.intent };
  } catch (err) {
    if (err?.needsClarification) {
      await replyFromTimeMailbox({
        senderIdentityId,
        to: email,
        subject,
        text: `${err.message}\n\n${CLARIFICATION_HELP}`,
        messageIdHeader
      });
      return { handled: true, replied: true, reason: 'needs_clarification' };
    }
    console.error('[PresenceTime] apply failed:', err);
    await replyFromTimeMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: `Something went wrong applying your status (${err.message || 'error'}). Try again, or set it from the Presence Board in the app.`,
      messageIdHeader
    });
    return { handled: true, replied: true, reason: 'error' };
  }
}

function subjectForReply(originalSubject) {
  const s = String(originalSubject || '').trim();
  if (!s) return 'Re: Presence Time';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

async function replyFromTimeMailbox({
  senderIdentityId,
  to,
  subject,
  text,
  messageIdHeader = null,
  userId = null
}) {
  try {
    const result = await sendEmailFromIdentity({
      senderIdentityId,
      to,
      subject: subjectForReply(subject),
      text,
      source: 'auto',
      inReplyTo: messageIdHeader || null,
      references: messageIdHeader || null,
      templateType: 'presence_time_reply',
      userId
    });
    if (result?.skipped) {
      await GoogleWorkspaceEmailService.sendEmail({
        to,
        subject: subjectForReply(subject),
        text,
        fromName: 'Presence Time',
        fromAddress: 'time@plottwistco.com',
        replyTo: 'time@plottwistco.com'
      });
    }
  } catch (err) {
    console.error('[PresenceTime] identity send failed, falling back:', err?.message || err);
    await GoogleWorkspaceEmailService.sendEmail({
      to,
      subject: subjectForReply(subject),
      text,
      fromName: 'Presence Time',
      fromAddress: 'time@plottwistco.com',
      replyTo: 'time@plottwistco.com'
    });
  }
}

export function isPresenceTimeIdentity(identity) {
  return String(identity?.identity_key || '').trim().toLowerCase() === 'presence_time';
}

export default {
  parsePresenceEmailIntent,
  handlePresenceTimeInbound,
  isPresenceTimeIdentity,
  applyAvailableOffline,
  applyUnavailable,
  applyPlannedOut
};
